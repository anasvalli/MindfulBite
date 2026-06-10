// Shared per-day aggregation — the ONE pipeline that turns raw logs into the
// daily numbers shown on Home, Nutrition, and Insights, and fed to the AI
// report. All bucketing uses local-timezone date keys (lib/dates.ts).
// Canonical day-attribution rules:
//   • meals/moods → the local calendar day of their timestamp
//   • sleep → its `date` column, which is the MORNING-OF (wake) date
//   • water/weight → their `date` column
// If a chart and the report ever disagree again, the bug is a screen not
// reading from here.

import { supabase } from './supabase'
import { localDateKey, lastNDates, dayLabel2 } from './dates'

export interface DayAgg {
  date: string // local YYYY-MM-DD
  label: string // "Th", "Fr" — unambiguous two-letter weekday
  calories: number
  protein: number
  carbs: number
  fat: number
  mealCount: number
  mood: string | null // latest check-in of the day
  moodIntensity: number | null // average intensity that day
  sleepMinutes: number | null
  sleepQuality: number | null
  waterMl: number
  weightKg: number | null
}

export async function aggregateDays(userId: string, nDays: number): Promise<DayAgg[]> {
  const keys = lastNDates(nDays)
  const firstKey = keys[0]
  // Timestamp window padded a day so timezone offsets never clip the first day.
  const sinceTs = new Date(Date.now() - (nDays + 1) * 24 * 60 * 60 * 1000).toISOString()

  const [meals, moods, sleep, water, weight] = await Promise.all([
    supabase
      .from('meals')
      .select('created_at,total_calories,macros_json')
      .eq('user_id', userId)
      .gte('created_at', sinceTs),
    supabase
      .from('mood_checkins')
      .select('logged_at,mood,intensity')
      .eq('user_id', userId)
      .gte('logged_at', sinceTs),
    supabase
      .from('sleep_logs')
      .select('date,duration_minutes,quality_score')
      .eq('user_id', userId)
      .gte('date', firstKey),
    supabase
      .from('water_logs')
      .select('date,amount_ml')
      .eq('user_id', userId)
      .gte('date', firstKey),
    supabase
      .from('weight_logs')
      .select('date,weight_kg')
      .eq('user_id', userId)
      .gte('date', firstKey),
  ])

  const byDay = new Map<string, DayAgg>()
  for (const k of keys) {
    byDay.set(k, {
      date: k,
      label: dayLabel2(k),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealCount: 0,
      mood: null,
      moodIntensity: null,
      sleepMinutes: null,
      sleepQuality: null,
      waterMl: 0,
      weightKg: null,
    })
  }

  for (const m of (meals.data ?? []) as Array<{
    created_at: string
    total_calories: number | null
    macros_json: { protein?: number; carbs?: number; fat?: number } | null
  }>) {
    const d = byDay.get(localDateKey(new Date(m.created_at)))
    if (!d) continue
    d.calories += m.total_calories ?? 0
    d.protein += m.macros_json?.protein ?? 0
    d.carbs += m.macros_json?.carbs ?? 0
    d.fat += m.macros_json?.fat ?? 0
    d.mealCount++
  }

  // Moods: keep the latest check-in's mood, average the intensities.
  const moodAcc = new Map<string, { sum: number; n: number; lastTs: number; mood: string }>()
  for (const m of (moods.data ?? []) as Array<{ logged_at: string; mood: string; intensity: number | null }>) {
    const ts = new Date(m.logged_at).getTime()
    const k = localDateKey(new Date(m.logged_at))
    const acc = moodAcc.get(k)
    if (!acc) moodAcc.set(k, { sum: m.intensity ?? 3, n: 1, lastTs: ts, mood: m.mood })
    else {
      acc.sum += m.intensity ?? 3
      acc.n++
      if (ts >= acc.lastTs) {
        acc.lastTs = ts
        acc.mood = m.mood
      }
    }
  }
  for (const [k, acc] of moodAcc) {
    const d = byDay.get(k)
    if (!d) continue
    d.mood = acc.mood
    d.moodIntensity = Math.round((acc.sum / acc.n) * 10) / 10
  }

  for (const s of (sleep.data ?? []) as Array<{ date: string; duration_minutes: number | null; quality_score: number | null }>) {
    const d = byDay.get(s.date)
    if (!d) continue
    d.sleepMinutes = s.duration_minutes ?? null
    d.sleepQuality = s.quality_score ?? null
  }

  for (const w of (water.data ?? []) as Array<{ date: string; amount_ml: number | null }>) {
    const d = byDay.get(w.date)
    if (d) d.waterMl += w.amount_ml ?? 0
  }

  for (const w of (weight.data ?? []) as Array<{ date: string; weight_kg: number | null }>) {
    const d = byDay.get(w.date)
    if (d) d.weightKg = w.weight_kg ?? null
  }

  return keys.map((k) => byDay.get(k)!)
}

// Days with at least one meal logged — the sample-size guard screens must use
// before claiming any "trend"/"consistency" (minimum 3 before such copy).
export function loggedDayCount(days: DayAgg[]): number {
  return days.filter((d) => d.mealCount > 0).length
}
