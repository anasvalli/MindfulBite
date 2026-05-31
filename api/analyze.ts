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

For EACH item also estimate:
- "grams": best estimate of edible weight in grams (used to compute nutrition). Be realistic.
- "confidence": 0.0–1.0, how sure you are of the identification.
- "alternatives": up to 2 other plausible dish names if uncertain (empty array if confident).

Respond with ONLY a valid JSON array, no markdown, no prose, exactly:
[{"id":"1","name":"Specific dish or drink name","quantity":"portion (e.g. 1 cup, 1 bowl, 200g)","grams":220,"calories":250,"protein":12,"carbs":30,"fat":8,"confidence":0.8,"alternatives":["Butter Chicken"]}]`

// ── Stage 2: verified nutrition lookup (USDA FoodData Central) ──────────────
// Free DB. Set USDA_API_KEY in env for production rate limits; DEMO_KEY works for
// light use. Returns per-100g macros for the best match, or null on miss/error.
const USDA_KEY = process.env.USDA_API_KEY ?? 'DEMO_KEY'

async function usdaMacrosPer100g(
  query: string,
): Promise<{ kcal: number; protein: number; carbs: number; fat: number } | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 4500)
  try {
    const url =
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}` +
      `&query=${encodeURIComponent(query)}&pageSize=1&dataType=Survey%20%28FNDDS%29,SR%20Legacy,Foundation`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const json: any = await res.json()
    const food = json?.foods?.[0]
    if (!food) return null
    const get = (names: string[]): number => {
      const n = (food.foodNutrients ?? []).find((x: any) =>
        names.some((nm) => (x.nutrientName ?? '').toLowerCase().includes(nm)),
      )
      return n ? Number(n.value) || 0 : 0
    }
    const kcal = get(['energy'])
    if (kcal <= 0) return null
    return { kcal, protein: get(['protein']), carbs: get(['carbohydrate']), fat: get(['total lipid', 'fat']) }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

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
    let parsed: any[] = []
    try {
      parsed = match ? JSON.parse(match[0]) : []
    } catch {
      parsed = []
    }
    if (!Array.isArray(parsed)) parsed = []

    // Dedupe items the model accidentally repeated (same name).
    const seenNames = new Set<string>()
    parsed = parsed.filter((it: any) => {
      const k = String(it?.name ?? '').trim().toLowerCase()
      if (!k || seenNames.has(k)) return false
      seenNames.add(k)
      return true
    })

    // ── Stage 2: verify macros against USDA for each item (parallel, bounded) ──
    // Use the DB's per-100g values scaled by the model's gram estimate ONLY when the
    // DB result is in the same ballpark as the vision estimate (0.5×–2×). A wildly
    // different number means a bad name match, so we keep the vision estimate. This
    // makes the DB a refinement, never a source of new error. Best effort, never blocks.
    const items = await Promise.all(
      parsed.slice(0, 6).map(async (it: any, i: number) => {
        const grams = Number(it.grams) > 0 ? Math.round(Number(it.grams)) : 0
        const base = {
          id: it.id != null ? String(it.id) : `item-${i}`,
          name: String(it.name ?? 'Food'),
          quantity: String(it.quantity ?? '1 serving'),
          grams: grams || undefined,
          confidence: typeof it.confidence === 'number' ? it.confidence : undefined,
          alternatives: Array.isArray(it.alternatives) ? it.alternatives.slice(0, 2).map(String) : [],
          calories: Math.round(Number(it.calories) || 0),
          protein: Math.round(Number(it.protein) || 0),
          carbs: Math.round(Number(it.carbs) || 0),
          fat: Math.round(Number(it.fat) || 0),
          source: 'estimate' as 'usda' | 'estimate',
        }
        // Only attempt DB verification when we have a gram estimate and a usable
        // vision calorie estimate to sanity-check against.
        if (grams > 0 && base.calories > 0) {
          const db = await usdaMacrosPer100g(base.name)
          if (db) {
            const f = grams / 100
            const dbCal = Math.round(db.kcal * f)
            const ratio = dbCal / base.calories
            // Accept the DB only if it agrees with the vision estimate (same ballpark).
            if (ratio >= 0.5 && ratio <= 2) {
              base.calories = dbCal
              base.protein = Math.round(db.protein * f)
              base.carbs = Math.round(db.carbs * f)
              base.fat = Math.round(db.fat * f)
              base.source = 'usda'
            }
          }
        }
        return base
      }),
    )

    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach AI service', details: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
