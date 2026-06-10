// Client-side food AI — calls server-side AI edge functions.
// No API key in the browser; keys stay server-side in Vercel.

import { supabase } from './supabase'
import type { FoodItem } from '../types'

function normalizeItems(raw: unknown): FoodItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `item-${Date.now()}-${i}`,
      name: typeof o.name === 'string' ? o.name : 'Food',
      quantity: typeof o.quantity === 'string' ? o.quantity : '1 serving',
      calories: Number(o.calories) || 0,
      protein: Number(o.protein) || 0,
      carbs: Number(o.carbs) || 0,
      fat: Number(o.fat) || 0,
      grams: Number(o.grams) > 0 ? Number(o.grams) : undefined,
      confidence: typeof o.confidence === 'number' ? o.confidence : undefined,
      alternatives: Array.isArray(o.alternatives) ? (o.alternatives as unknown[]).map(String) : undefined,
      source: o.source === 'usda' ? 'usda' : o.source === 'estimate' ? 'estimate' : undefined,
    }
  })
}

export async function analyzeFoodImage(
  base64Image: string,
  context?: { cuisine?: string | null; dietary?: string | null }
): Promise<FoodItem[]> {
  // JWT lets the server pull this user's correction history (server verifies it).
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      image: base64Image,
      cuisine: context?.cuisine ?? '',
      dietary: context?.dietary ?? '',
    }),
  })
  if (!res.ok) throw new Error(`Analyze failed (${res.status})`)
  const data = (await res.json()) as { items?: unknown }
  return normalizeItems(data.items)
}

export async function searchFood(query: string): Promise<FoodItem[]> {
  const res = await fetch('/api/food-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { items?: unknown }
  return normalizeItems(data.items)
}
