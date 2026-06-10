// Single source of truth for daily calorie + macro targets.
// Every ring, bar, "/g" denominator, and AI prompt must read from here —
// never recompute splits inline (that's how Home/Nutrition/Insights ended up
// showing three different protein goals for the same user).

import type { User } from '../types'
import { calculateMacroTargets } from './macros'

export interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export function macroTargets(profile: Partial<User> | null | undefined): Targets {
  const calories = profile?.daily_calorie_goal ?? 2150
  // The stored profile goals (set at onboarding, editable in Settings) win.
  if (profile?.protein_goal && profile?.carbs_goal && profile?.fat_goal) {
    return {
      calories,
      protein: profile.protein_goal,
      carbs: profile.carbs_goal,
      fat: profile.fat_goal,
    }
  }
  // Fall back to the standard calculation only when goals were never stored.
  const calc = calculateMacroTargets(profile?.weight ?? 70, profile?.goal_weight ?? null, calories)
  return { calories, ...calc }
}
