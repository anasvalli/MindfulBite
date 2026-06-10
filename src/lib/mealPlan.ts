// Meal plan generation + storage, shared by MealPlanScreen (display/regenerate),
// OnboardingScreen (auto-generate the first plan on completion), and HomeScreen
// (morning brief / plan preview). Plans are stored per-user so two accounts on
// one device never see each other's plan, and carry their generation date.

import { supabase } from './supabase'
import { parseTime12h } from './time'
import { localDateKey } from './dates'
import type { User } from '../types'

export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner'

export interface MealPlanItem {
  type: MealType
  name: string
  calories: number
  emoji: string
  time: string
  protein?: number
  carbs?: number
  fat?: number
}

export interface StoredPlan {
  date: string // local YYYY-MM-DD the plan was generated
  items: MealPlanItem[]
}

const keyFor = (userId: string) => `mealPlan_${userId}`
const pendingKey = (userId: string) => `mealPlanPending_${userId}`

export function loadMealPlan(userId: string): StoredPlan | null {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (raw) {
      const parsed = JSON.parse(raw) as StoredPlan | MealPlanItem[]
      // Stored shape
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) return parsed
      // Pre-refactor shape (bare array) — adopt it as today's
      if (Array.isArray(parsed) && parsed.length > 0) return { date: localDateKey(new Date()), items: parsed }
    }
    // Migrate the legacy global key once
    const legacy = localStorage.getItem('mealPlan')
    if (legacy) {
      const items = JSON.parse(legacy) as MealPlanItem[]
      localStorage.removeItem('mealPlan')
      if (Array.isArray(items) && items.length > 0) {
        const plan = { date: localDateKey(new Date()), items }
        localStorage.setItem(keyFor(userId), JSON.stringify(plan))
        return plan
      }
    }
  } catch {
    // corrupt entry — treat as absent
  }
  return null
}

export function saveMealPlan(userId: string, items: MealPlanItem[]): StoredPlan {
  const plan: StoredPlan = { date: localDateKey(new Date()), items }
  localStorage.setItem(keyFor(userId), JSON.stringify(plan))
  return plan
}

export function isMealPlanPending(userId: string): boolean {
  return localStorage.getItem(pendingKey(userId)) === '1'
}

// Meal times anchored to the user's actual day: breakfast ~45min after waking,
// dinner ~2.5h before bed, lunch/snack spread between. Defaults 8AM/11PM.
export function computeMealTimes(
  wake: string | null | undefined,
  sleep: string | null | undefined,
): Record<MealType, string> {
  const toMinutes = (s: string | null | undefined, fallback: number): number => {
    const d = s ? parseTime12h(s) : null
    return d ? d.getHours() * 60 + d.getMinutes() : fallback
  }
  const fmt = (mins: number): string => {
    mins = ((mins % 1440) + 1440) % 1440
    let h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    const ap = h < 12 ? 'AM' : 'PM'
    h = h % 12 === 0 ? 12 : h % 12
    return `${h}:${String(m).padStart(2, '0')} ${ap}`
  }
  let w = toMinutes(wake, 8 * 60)
  let s = toMinutes(sleep, 23 * 60)
  if (s <= w) s += 1440 // past-midnight sleeper
  const breakfast = w + 45
  const dinner = s - 150
  const span = Math.max(120, dinner - breakfast)
  return {
    breakfast: fmt(breakfast),
    lunch: fmt(breakfast + span * 0.42),
    snacks: fmt(breakfast + span * 0.7),
    dinner: fmt(dinner),
  }
}

// Generate (via Sage) and persist a 1-day plan. Throws on failure — callers
// surface their own error UI. Sets the pending flag while in flight so Home
// can show "Sage is building your day…" during onboarding hand-off.
export async function generateMealPlan(
  userId: string,
  profile: Partial<User> | null | undefined,
): Promise<MealPlanItem[]> {
  localStorage.setItem(pendingKey(userId), '1')
  try {
    const prefs = profile?.dietary_prefs ?? 'None'
    const goal = profile?.daily_calorie_goal ?? 2150
    const cuisine = profile?.cuisine_pref ?? 'no specific preference'
    const weightGoal =
      profile?.goal_weight && profile?.weight
        ? profile.goal_weight < profile.weight
          ? 'lose weight'
          : profile.goal_weight > profile.weight
            ? 'gain muscle'
            : 'maintain weight'
        : 'maintain weight'

    const times = computeMealTimes(profile?.wake_time, profile?.sleep_time)
    const message = `Generate a 1-day meal plan for me. My cuisine preference is ${cuisine}. Make all meals authentic to ${cuisine} cuisine.
My profile: ${prefs} diet, ${goal} kcal daily goal, goal: ${weightGoal}.
I wake at ${profile?.wake_time ?? '8:00 AM'} and sleep at ${profile?.sleep_time ?? '11:00 PM'}, so use EXACTLY these meal times: breakfast ${times.breakfast}, lunch ${times.lunch}, snacks ${times.snacks}, dinner ${times.dinner}.
Return ONLY a JSON array, no text before or after:
[
  {"type":"breakfast","name":"meal name","calories":N,"emoji":"🍳","time":"${times.breakfast}","protein":N,"carbs":N,"fat":N},
  {"type":"lunch","name":"meal name","calories":N,"emoji":"🥗","time":"${times.lunch}","protein":N,"carbs":N,"fat":N},
  {"type":"snacks","name":"meal name","calories":N,"emoji":"🍎","time":"${times.snacks}","protein":N,"carbs":N,"fat":N},
  {"type":"dinner","name":"meal name","calories":N,"emoji":"🍽️","time":"${times.dinner}","protein":N,"carbs":N,"fat":N}
]
Make meals culturally appropriate for my diet preferences. Total should be close to ${goal} kcal.`

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        message,
        history: [],
        userContext: `User dietary preferences: ${prefs}. Calorie goal: ${goal} kcal. Cuisine preference: ${cuisine}.`,
        userId,
      }),
    })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    const data = (await res.json()) as { reply: string; error?: string }
    if (data.error) throw new Error(data.error)

    const match = data.reply.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Invalid response format — could not parse meal plan.')
    const items = JSON.parse(match[0]) as MealPlanItem[]
    if (!Array.isArray(items) || items.length === 0) throw new Error('Empty meal plan returned.')

    // Guarantee times respect the user's wake/sleep window, regardless of the model.
    items.forEach((it) => {
      if (times[it.type]) it.time = times[it.type]
    })

    saveMealPlan(userId, items)
    return items
  } finally {
    localStorage.removeItem(pendingKey(userId))
  }
}

// The next upcoming planned meal today (for the Home morning brief), or the
// first meal if all have passed / plan is from a previous day.
export function nextPlannedMeal(plan: StoredPlan | null): MealPlanItem | null {
  if (!plan || plan.items.length === 0) return null
  if (plan.date !== localDateKey(new Date())) return plan.items[0] ?? null
  const now = new Date()
  for (const it of plan.items) {
    const t = parseTime12h(it.time)
    if (t && t.getTime() > now.getTime()) return it
  }
  return null
}
