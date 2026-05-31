// Vercel Edge Function — food image analysis via Claude Sonnet vision.
// Accuracy-first: Sonnet 4.6 (best vision), cuisine/diet context injected so
// the model reasons about the user's actual food culture instead of defaulting
// to generic Western items. Prompt-cached system instructions keep cost down.

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const SYSTEM_PROMPT = `You are an expert nutritionist and chef with deep knowledge of global cuisines, including South Asian (Pakistani, Indian, Bangladeshi), Middle Eastern, and beverages. You analyze food AND drink photos with great care and precision.

Method — follow this every time:
1. Look carefully at the WHOLE image: the dish/drink, its color, texture, sauce, container (cup, mug, glass, bowl, plate), garnishes, and any sides.
2. BEVERAGES COUNT. A cup/mug/glass of liquid is a loggable item — chai (spiced milk tea, ~120-180 kcal/cup with milk+sugar), coffee (black ~5 kcal; with milk/sugar 60-150; latte/cappuccino 120-200), tea, lassi, juice, smoothies, soft drinks, milk. Identify the drink and estimate calories including milk and sugar. NEVER return empty just because it's a drink.
3. Use the user's cuisine context to name dishes. Pakistani and Indian food look very similar — do NOT agonize over the exact country. Name the SPECIFIC DISH accurately (e.g. "Chicken Karahi", "Chicken Biryani", "Daal", "Nihari", "Butter Chicken", "Chana Masala"). If the user's cuisine is Pakistani, lean toward Pakistani naming for ambiguous dishes; if Indian, Indian naming. The dish name and the macros matter far more than the country label.
4. Do NOT jump to a single common Western ingredient (e.g. "peanut butter") for a sauced South Asian dish. Identify the dish, then its components.
5. Identify every distinct food/drink item visible.
6. Estimate a realistic portion for each from visual cues, then accurate calories and macros.

ONLY return an empty array if the image truly contains no food or drink at all (e.g. a person, a landscape, a random object).

Respond with ONLY a valid JSON array, no markdown, no prose, exactly:
[{"id":"1","name":"Specific dish or drink name","quantity":"portion (e.g. 1 cup, 1 bowl, 200g)","calories":250,"protein":12,"carbs":30,"fat":8}]`

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { image?: string; cuisine?: string; dietary?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw = body.image ?? ''
  const mediaMatch = raw.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/)
  const mediaType = mediaMatch ? mediaMatch[1] : 'image/jpeg'
  const data = mediaMatch ? mediaMatch[2] : raw.replace(/^data:[^;]+;base64,/, '')

  if (!data) {
    return new Response(JSON.stringify({ error: 'No image provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const cuisine = (body.cuisine ?? '').trim()
  const dietary = (body.dietary ?? '').trim()
  const contextLine =
    `User context — cuisine preference: ${cuisine || 'unspecified'}; dietary: ${dietary || 'none'}. ` +
    `Use the cuisine to name ambiguous dishes (e.g. South Asian → name the specific karahi/biryani/daal rather than guessing the country). Beverages like chai, coffee, lassi count — identify and estimate them. Analyze the food or drink and return the JSON array.`

  // Correction-memory feedback loop: if we know the user and have a service key,
  // pull their recent corrections so the model calibrates to their preferences.
  // Best-effort only — never block or break analysis.
  let correctionHint = ''
  const userId = (body.userId ?? '').trim()
  if (userId && SERVICE_KEY) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/food_corrections` +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&order=created_at.desc&limit=8` +
        `&select=original_name,corrected_name,original_calories,corrected_calories`
      const cRes = await fetch(url, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      })
      if (cRes.ok) {
        const corrections = (await cRes.json()) as Array<{
          original_name?: string
          corrected_name?: string
          original_calories?: number
          corrected_calories?: number
        }>
        if (Array.isArray(corrections) && corrections.length > 0) {
          const list = corrections
            .slice(0, 8)
            .map(
              (c) =>
                `${c.original_name ?? '?'} → ${c.corrected_name ?? '?'} (${c.original_calories ?? '?'} cal → ${c.corrected_calories ?? '?'} cal)`
            )
            .join(', ')
          correctionHint =
            ` Note — this user has previously corrected your estimates. Lean toward their preferences: [${list}].` +
            ` Use these to calibrate naming and portion/calorie estimates.`
        }
      }
    } catch {
      // ignore — proceed without correction context
    }
  }

  const anthropicBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: contextLine + correctionHint },
        ],
      },
    ],
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ error: 'AI service error', details: errText }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }

    const json = (await res.json()) as { content: Array<{ type: string; text: string }> }
    const text = json.content?.find((c) => c.type === 'text')?.text ?? '[]'
    const match = text.match(/\[[\s\S]*\]/)
    let items: unknown = []
    try {
      items = match ? JSON.parse(match[0]) : []
    } catch {
      items = []
    }

    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach AI service', details: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
