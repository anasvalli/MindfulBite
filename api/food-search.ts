// Vercel Edge Function — text food search.
// Real verified nutrition from Open Food Facts (no API key) merged with
// Claude Haiku results for generic/whole foods OFF covers poorly.

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

const SYSTEM_PROMPT = `You are a nutrition database. Given a food search query, return 3-4 relevant food items with realistic nutritional values for a typical serving. Prioritize generic/whole foods (e.g. "grilled chicken breast", "2 boiled eggs") over branded products.

Respond with ONLY a valid JSON array, no markdown, no prose:
[{"id":"1","name":"Food name","quantity":"1 serving (Xg)","calories":250,"protein":12,"carbs":30,"fat":8}]`

interface FoodItem {
  id: string
  name: string
  quantity: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

function num(x: unknown): number {
  return Number(x) || 0
}

// Map Open Food Facts products into FoodItem shape.
// Prefers per-serving nutriments; falls back to per-100g.
function mapOffProducts(query: string, products: any[]): FoodItem[] {
  const out: FoodItem[] = []
  for (let i = 0; i < products.length && out.length < 6; i++) {
    const p = products[i] ?? {}
    const n = p.nutriments ?? {}

    const rawName = (p.product_name ?? '').toString().trim()
    if (!rawName) continue

    // Build name: dedupe brand if it already appears in the product name.
    const brand = (p.brands ?? '').toString().split(',')[0].trim()
    let name = rawName
    if (brand && !rawName.toLowerCase().includes(brand.toLowerCase())) {
      name = `${brand} ${rawName}`.trim()
    }

    const hasServing = n['energy-kcal_serving'] != null && num(n['energy-kcal_serving']) > 0
    const calories = Math.round(
      hasServing ? num(n['energy-kcal_serving']) : num(n['energy-kcal_100g'])
    )
    if (calories <= 0) continue // skip products with no usable energy value

    const protein = Math.round(
      (hasServing ? num(n['proteins_serving']) : num(n['proteins_100g'])) * 10
    ) / 10
    const carbs = Math.round(
      (hasServing ? num(n['carbohydrates_serving']) : num(n['carbohydrates_100g'])) * 10
    ) / 10
    const fat = Math.round(
      (hasServing ? num(n['fat_serving']) : num(n['fat_100g'])) * 10
    ) / 10

    const serving = (p.serving_size ?? '').toString().trim()
    const quantity = hasServing && serving ? serving : '100g'

    out.push({
      id: `off-${i}`,
      name,
      quantity,
      calories,
      protein,
      carbs,
      fat,
    })
  }
  return out
}

async function searchOpenFoodFacts(query: string): Promise<FoodItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '8',
      fields: 'product_name,brands,nutriments,serving_size',
    })
    const res = await fetch(`${OFF_SEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MindfulBite/1.0' },
    })
    if (!res.ok) return []
    const json: any = await res.json()
    const products: any[] = Array.isArray(json?.products) ? json.products : []
    return mapOffProducts(query, products)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
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

  // Claude Haiku — covers generic/whole foods OFF returns poorly.
  async function searchClaude(): Promise<FoodItem[]> {
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
          'x-api-key': apiKey as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(anthropicBody),
      })
      if (!res.ok) return []
      const json = (await res.json()) as { content: Array<{ type: string; text: string }> }
      const text = json.content?.find((c) => c.type === 'text')?.text ?? '[]'
      const match = text.match(/\[[\s\S]*\]/)
      let parsed: any[] = []
      try { parsed = match ? JSON.parse(match[0]) : [] } catch { parsed = [] }
      if (!Array.isArray(parsed)) return []
      // Normalize numeric fields (Claude usually returns numbers, but be safe).
      return parsed
        .filter((it) => it && it.name)
        .map((it, i): FoodItem => ({
          id: it.id != null ? String(it.id) : `ai-${i}`,
          name: String(it.name).trim(),
          quantity: it.quantity != null ? String(it.quantity) : '1 serving',
          calories: Math.round(num(it.calories)),
          protein: Math.round(num(it.protein) * 10) / 10,
          carbs: Math.round(num(it.carbs) * 10) / 10,
          fat: Math.round(num(it.fat) * 10) / 10,
        }))
    } catch {
      return []
    }
  }

  // Query both sources in parallel; each degrades gracefully to [].
  const [claudeItems, offItems] = await Promise.all([
    searchClaude(),
    searchOpenFoodFacts(query),
  ])

  // Merge: Claude generic results first, then OFF branded results.
  // Dedupe by lowercased name; cap at 8.
  const merged: FoodItem[] = []
  const seen = new Set<string>()
  for (const it of [...claudeItems, ...offItems]) {
    if (!it.name || it.calories <= 0) continue
    const key = it.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ ...it, id: String(merged.length + 1) })
    if (merged.length >= 8) break
  }

  return new Response(JSON.stringify({ items: merged }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
