// Vercel Edge Function — text food search via Claude Haiku
// Cheap (text-only, small output). Cached system prompt.

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are a nutrition database. Given a food search query, return 4-6 relevant food items with realistic nutritional values for a typical serving.

Respond with ONLY a valid JSON array, no markdown, no prose:
[{"id":"1","name":"Food name","quantity":"1 serving (Xg)","calories":250,"protein":12,"carbs":30,"fat":8}]`

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

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const query = (body.query ?? '').trim()
  if (!query) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const anthropicBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: `Search query: "${query}"` }],
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
    try { items = match ? JSON.parse(match[0]) : [] } catch { items = [] }
    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach AI service', details: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
