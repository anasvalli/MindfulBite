// Vercel Edge Function — food image analysis via Claude Haiku vision
// Cost-optimized: Haiku model, prompt caching on the system instructions,
// capped output tokens. The client pre-resizes images to ~768px to minimize
// image tokens (Claude bills ~ (w*h)/750 tokens per image).

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Stable system prompt — cached so repeat scans only pay 10% for these tokens.
const SYSTEM_PROMPT = `You are an expert nutritionist with precise visual food assessment. You analyze food photos and return accurate calorie and macro estimates.

Rules:
- Identify every distinct food item visible in the image.
- Estimate a realistic portion size for each based on visual cues (plate size, utensils, packaging).
- Give accurate calorie and macro (protein, carbs, fat in grams) estimates for that portion.
- If the image contains no food, return an empty array.

Respond with ONLY a valid JSON array, no markdown, no prose, in exactly this shape:
[{"id":"1","name":"Food name","quantity":"portion (e.g. 1 cup, 150g)","calories":250,"protein":12,"carbs":30,"fat":8}]`

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

  let body: { image?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw = body.image ?? ''
  // Accept data URL or bare base64
  const mediaMatch = raw.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/)
  const mediaType = mediaMatch ? mediaMatch[1] : 'image/jpeg'
  const data = mediaMatch ? mediaMatch[2] : raw.replace(/^data:[^;]+;base64,/, '')

  if (!data) {
    return new Response(JSON.stringify({ error: 'No image provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const anthropicBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: 'Analyze this meal and return the JSON array.' },
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
