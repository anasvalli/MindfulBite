// Shared time helpers.

// Parse a 12-hour time string ("8:00 AM", "1:30 PM") into today's Date.
export function parseTime12h(timeStr: string): Date | null {
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  const ampm = m[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  const d = new Date()
  d.setHours(h, min, 0, 0)
  return d
}
