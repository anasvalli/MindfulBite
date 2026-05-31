// Single source of truth for the user's primary wellness goal.
// Used by onboarding, settings, the home goal-progress card, and the AI context.

export interface GoalDef {
  key: string
  label: string
  emoji: string
  blurb: string
  // Which metric the home "progress" card should track for this goal.
  metric: 'weight' | 'protein' | 'sleep' | 'mood' | 'calories'
}

export const GOALS: GoalDef[] = [
  { key: 'lose_fat', label: 'Lose fat', emoji: '🔥', blurb: 'Trim down sustainably', metric: 'weight' },
  { key: 'build_muscle', label: 'Build muscle', emoji: '💪', blurb: 'Gain strength & lean mass', metric: 'protein' },
  { key: 'eat_healthier', label: 'Eat healthier', emoji: '🥗', blurb: 'Better food, steady energy', metric: 'calories' },
  { key: 'sleep_better', label: 'Sleep better', emoji: '😴', blurb: 'More restful nights', metric: 'sleep' },
  { key: 'manage_stress', label: 'Feel calmer', emoji: '🧘', blurb: 'Steady mood, less stress-eating', metric: 'mood' },
  { key: 'maintain', label: 'Maintain', emoji: '⚖️', blurb: 'Stay balanced & consistent', metric: 'weight' },
]

export function goalFor(key: string | null | undefined): GoalDef | null {
  if (!key) return null
  return GOALS.find((g) => g.key === key) ?? null
}

// A short human label for the AI context, e.g. "Build muscle (gain strength & lean mass)".
export function goalContext(key: string | null | undefined): string {
  const g = goalFor(key)
  return g ? `${g.label} — ${g.blurb}` : 'not set'
}
