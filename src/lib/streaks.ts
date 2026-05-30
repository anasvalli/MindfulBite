import { supabase } from './supabase'

// ─── Local date helpers ─────────────────────────────────────────────────────
// Convert a Date to a local YYYY-MM-DD string (NOT UTC — uses the device tz).
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Subtract n days from a date key, returning a new local date key.
function shiftKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + deltaDays)
  return localDateKey(dt)
}

export interface StreakResult {
  current: number
  best: number
  daysThisWeek: number
}

/**
 * Compute streak stats from the user's last ~90 days of meals.
 * - current: consecutive days up to today (or yesterday, if today isn't logged
 *   yet) with at least one meal.
 * - best: longest consecutive run of logged days in the window.
 * - daysThisWeek: distinct logged days within the last 7 calendar days.
 */
export async function computeStreak(userId: string): Promise<StreakResult> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('meals')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)

  const empty: StreakResult = { current: 0, best: 0, daysThisWeek: 0 }
  if (!data || data.length === 0) return empty

  // Reduce to a Set of local YYYY-MM-DD strings.
  const days = new Set<string>()
  for (const row of data as Array<{ created_at: string }>) {
    if (!row?.created_at) continue
    const d = new Date(row.created_at)
    if (Number.isNaN(d.getTime())) continue
    days.add(localDateKey(d))
  }
  if (days.size === 0) return empty

  const todayKey = localDateKey(new Date())
  const yesterdayKey = shiftKey(todayKey, -1)

  // ── current streak ──
  // Anchor at today if logged, else yesterday (so a streak isn't "broken"
  // just because today's meal hasn't been logged yet). If neither, current = 0.
  let current = 0
  let cursor: string | null = null
  if (days.has(todayKey)) cursor = todayKey
  else if (days.has(yesterdayKey)) cursor = yesterdayKey

  while (cursor && days.has(cursor)) {
    current++
    cursor = shiftKey(cursor, -1)
  }

  // ── best streak ──
  // Walk sorted keys; count runs where each day is exactly one after the prev.
  const sorted = Array.from(days).sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const key of sorted) {
    if (prev !== null && shiftKey(prev, 1) === key) {
      run++
    } else {
      run = 1
    }
    if (run > best) best = run
    prev = key
  }

  // ── days this week (last 7 calendar days incl. today) ──
  let daysThisWeek = 0
  for (let i = 0; i < 7; i++) {
    if (days.has(shiftKey(todayKey, -i))) daysThisWeek++
  }

  return { current, best, daysThisWeek }
}
