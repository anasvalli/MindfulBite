// Vercel Edge Function — food image analysis via Claude Sonnet vision.
// Accuracy-first: Sonnet 4.6 (best vision), cuisine/diet context injected so
// the model reasons about the user's actual food culture instead of defaulting
// to generic Western items. Prompt-cached system instructions keep cost down.

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are an expert nutritionist and chef with deep knowledge of global cuisines. You analyze food photos with great care and precision.

Method — follow this every time:
1. Look carefully at the WHOLE image: the dish, its color, texture, sauce, container, garnishes, and any sides.
2. Consider the user's cuisine context (provided in the message). A brown sauced dish in a bowl from a South Asian kitchen is far more likely to be a curry/salan/daal than peanut butter. Reason about what dish this most plausibly is given that context.
3. Do NOT jump to a single common ingredient. Most photos are prepared dishes or full meals — identify the dish, then its components.
4. Identify every distinct food item visible.
5. Estimate a realistic portion for each from visual cues, then accurate calories and macros.

If the image genuinely contains no food, return an empty array.

Respond with ONLY a valid JSON array, no markdown, no prose, exactly:
[{"id":"1","name":"Specific dish or food name","quantity":"portion (e.g. 1 bowl, 200g)","calories":250,"protein":12,"carbs":30,"fat":8}]`

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

  let body: { image?: string; cuisine?: string; dietary?: string }
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
    `Use this to inform what dish this most likely is. Analyze the meal and return the JSON array.`

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
          { type: 'text', text: contextLine },
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
