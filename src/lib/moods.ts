// Single source of truth for mood definitions (emoji + accent hue).

export interface MoodDef {
  key: string
  emoji: string
  hue: number
}

export const MOODS: MoodDef[] = [
  { key: 'Radiant', emoji: '☀️', hue: 85 },
  { key: 'Calm', emoji: '🍃', hue: 150 },
  { key: 'Tired', emoji: '🌙', hue: 250 },
  { key: 'Tense', emoji: '🌀', hue: 30 },
  { key: 'Low', emoji: '🌧️', hue: 260 },
]

export const MOOD_HUES: Record<string, number> = Object.fromEntries(
  MOODS.map((m) => [m.key, m.hue])
)

export const MOOD_EMOJIS: Record<string, string> = Object.fromEntries(
  MOODS.map((m) => [m.key, m.emoji])
)
