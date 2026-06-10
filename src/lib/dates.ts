// Shared local-timezone date helpers — the ONE place date-keying lives.
// Every screen and aggregation must bucket by these (never UTC/toISOString),
// so the same log lands on the same day everywhere in the app.

// Convert a Date to a local YYYY-MM-DD string (device timezone, NOT UTC).
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Shift a YYYY-MM-DD key by n days (local calendar), returning a new key.
export function shiftKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + deltaDays)
  return localDateKey(dt)
}

// The last n local date keys, oldest → newest, ending today.
export function lastNDates(n: number): string[] {
  const today = localDateKey(new Date())
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftKey(today, -i))
  return out
}

// Unambiguous two-letter weekday label for a date key ("Th", "Fr" — never two
// identical "T"/"S" columns in a week chart).
export function dayLabel2(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dt.getDay()] ?? ''
}
