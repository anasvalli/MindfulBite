import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MOOD_EMOJIS } from '../lib/moods'
import { Spinner } from './ui'

// ─── Local date helpers ─────────────────────────────────────────────────────
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface RecapData {
  totalMeals: number
  avgCalories: number
  daysLogged: number
  dominantMood: string | null
  avgSleepHours: number | null
}

export function WeeklyRecap({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RecapData | null>(null)
  const [copied, setCopied] = useState(false)

  // Date range: last 7 calendar days including today.
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  const sinceIso = start.toISOString()
  const sinceDate = localDateKey(start)

  const rangeLabel = `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [mealsRes, moodRes, sleepRes] = await Promise.allSettled([
        supabase
          .from('meals')
          .select('total_calories, created_at')
          .eq('user_id', userId)
          .gte('created_at', sinceIso),

        supabase
          .from('mood_checkins')
          .select('mood, logged_at')
          .eq('user_id', userId)
          .gte('logged_at', sinceIso),

        supabase
          .from('sleep_logs')
          .select('duration_minutes, date')
          .eq('user_id', userId)
          .gte('date', sinceDate),
      ])

      // ── Meals: total count, avg daily calories, distinct logged days ──
      let totalMeals = 0
      let totalCalories = 0
      const loggedDays = new Set<string>()
      if (mealsRes.status === 'fulfilled' && mealsRes.value.data) {
        const rows = mealsRes.value.data as Array<{
          total_calories: number | null
          created_at: string
        }>
        totalMeals = rows.length
        for (const r of rows) {
          totalCalories += r.total_calories ?? 0
          if (r.created_at) loggedDays.add(localDateKey(new Date(r.created_at)))
        }
      }
      const daysLogged = loggedDays.size
      const avgCalories = daysLogged > 0 ? Math.round(totalCalories / daysLogged) : 0

      // ── Dominant mood ──
      let dominantMood: string | null = null
      if (moodRes.status === 'fulfilled' && moodRes.value.data) {
        const counts = new Map<string, number>()
        for (const r of moodRes.value.data as Array<{ mood: string | null }>) {
          if (!r.mood) continue
          counts.set(r.mood, (counts.get(r.mood) ?? 0) + 1)
        }
        let topCount = 0
        for (const [mood, count] of counts) {
          if (count > topCount) {
            topCount = count
            dominantMood = mood
          }
        }
      }

      // ── Avg sleep ──
      let avgSleepHours: number | null = null
      if (sleepRes.status === 'fulfilled' && sleepRes.value.data) {
        const rows = sleepRes.value.data as Array<{ duration_minutes: number | null }>
        const valid = rows.filter((r) => typeof r.duration_minutes === 'number')
        if (valid.length > 0) {
          const totalMin = valid.reduce((s, r) => s + (r.duration_minutes ?? 0), 0)
          avgSleepHours = Math.round((totalMin / valid.length / 60) * 10) / 10
        }
      }

      if (!cancelled) {
        setData({ totalMeals, avgCalories, daysLogged, dominantMood, avgSleepHours })
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function buildSummaryText(d: RecapData): string {
    const parts = [
      `🌿 Mindful Bite — My Week in Review (${rangeLabel})`,
      `🍽️ ${d.totalMeals} meals logged`,
      `🔥 ${d.avgCalories.toLocaleString()} avg daily calories`,
      `📆 ${d.daysLogged}/7 days tracked`,
    ]
    if (d.avgSleepHours != null) parts.push(`😴 ${d.avgSleepHours}h avg sleep`)
    if (d.dominantMood) parts.push(`${MOOD_EMOJIS[d.dominantMood] ?? '✨'} Mostly ${d.dominantMood}`)
    return parts.join('\n')
  }

  function warmSummary(d: RecapData): string {
    if (d.daysLogged >= 6) return 'An incredible week of showing up for yourself. Keep glowing. ✨'
    if (d.daysLogged >= 3) return 'Steady, mindful progress — every meal logged is a small act of care.'
    if (d.daysLogged >= 1) return 'You started, and that matters. Next week is yours to build on.'
    return 'A fresh week is waiting. Let’s make the next one count. 🌱'
  }

  // Render the recap to a branded share-card image (people share images, not
  // walls of emoji text). Falls back to text share / clipboard.
  function renderShareCard(d: RecapData): Promise<File | null> {
    return new Promise((resolve) => {
      try {
        const W = 720
        const H = 900
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)

        const css = getComputedStyle(document.documentElement)
        const bg = css.getPropertyValue('--surface').trim() || '#1f1b16'
        const text = css.getPropertyValue('--text').trim() || '#f4efe7'
        const dim = css.getPropertyValue('--text-muted').trim() || '#a99e8e'
        const accent = css.getPropertyValue('--accent').trim() || '#d9b36a'

        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)
        // soft accent glow
        const grad = ctx.createRadialGradient(W - 80, 60, 10, W - 80, 60, 420)
        grad.addColorStop(0, 'rgba(217,179,106,0.22)')
        grad.addColorStop(1, 'rgba(217,179,106,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)

        ctx.fillStyle = accent
        ctx.font = '600 30px Hanken Grotesk, sans-serif'
        ctx.fillText('🌿 Mindful Bite', 56, 96)

        ctx.fillStyle = text
        ctx.font = '600 72px Georgia, serif'
        ctx.fillText('My Week', 56, 220)
        ctx.fillText('in Review', 56, 300)

        ctx.fillStyle = dim
        ctx.font = '26px monospace'
        ctx.fillText(rangeLabel, 56, 352)

        const stats: Array<[string, string]> = [
          ['MEALS LOGGED', `${d.totalMeals}`],
          ['AVG CALORIES', `${d.avgCalories.toLocaleString()} kcal/day`],
          ['DAYS TRACKED', `${d.daysLogged} of 7`],
          ['AVG SLEEP', d.avgSleepHours != null ? `${d.avgSleepHours}h` : '—'],
        ]
        stats.forEach(([label, value], i) => {
          const y = 450 + i * 96
          ctx.fillStyle = dim
          ctx.font = '600 20px Hanken Grotesk, sans-serif'
          ctx.fillText(label, 56, y)
          ctx.fillStyle = accent
          ctx.font = '600 46px Georgia, serif'
          ctx.fillText(value, 56, y + 48)
        })

        if (d.dominantMood) {
          ctx.fillStyle = text
          ctx.font = '30px Hanken Grotesk, sans-serif'
          ctx.fillText(`${MOOD_EMOJIS[d.dominantMood] ?? '✨'} Mostly ${d.dominantMood}`, 56, 858)
        }

        canvas.toBlob((blob) => {
          if (!blob) return resolve(null)
          resolve(new File([blob], 'mindfulbite-week.png', { type: 'image/png' }))
        }, 'image/png')
      } catch {
        resolve(null)
      }
    })
  }

  async function handleShare() {
    if (!data) return
    const text = buildSummaryText(data)
    if (typeof navigator !== 'undefined' && navigator.share) {
      // Prefer the branded image card when file-sharing is supported.
      const file = await renderShareCard(data)
      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: 'My Week in Review', files: [file], text })
          return
        } catch {
          // cancelled or unsupported — fall through
        }
      }
      try {
        await navigator.share({ title: 'My Week in Review', text })
        return
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(8, 8, 10, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="mb-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: 22,
          padding: 28,
          border: '1px solid var(--accent-line)',
          background:
            'linear-gradient(165deg, var(--accent-wash) 0%, var(--surface) 42%, var(--surface-2) 100%)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        {/* subtle accent glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -60,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'var(--accent-wash)',
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }}
        />

        {loading || !data ? (
          <div
            style={{
              minHeight: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <Spinner />
            <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-dim)' }}>
              Gathering your week…
            </span>
          </div>
        ) : (
          <>
            {/* Brand */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--accent)',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 15 }}>🌿</span> Mindful Bite
            </div>

            {/* Headline */}
            <div style={{ position: 'relative' }}>
              <h1
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 38,
                  lineHeight: 1.04,
                  fontWeight: 600,
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                }}
              >
                Your Week
                <br />
                in Review
              </h1>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                }}
              >
                {rangeLabel}
              </div>
            </div>

            {/* Stat grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                position: 'relative',
              }}
            >
              <Stat label="Meals" value={data.totalMeals.toLocaleString()} />
              <Stat label="Avg calories" value={data.avgCalories.toLocaleString()} unit="kcal/day" />
              <Stat label="Days tracked" value={`${data.daysLogged}`} unit="of 7" />
              <Stat
                label="Avg sleep"
                value={data.avgSleepHours != null ? `${data.avgSleepHours}` : '—'}
                unit={data.avgSleepHours != null ? 'hours' : 'no data'}
              />
            </div>

            {/* Dominant mood */}
            {data.dominantMood && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: 30, lineHeight: 1 }}>
                  {MOOD_EMOJIS[data.dominantMood] ?? '✨'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Dominant mood
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 22,
                      fontWeight: 600,
                      color: 'var(--text)',
                    }}
                  >
                    {data.dominantMood}
                  </span>
                </div>
              </div>
            )}

            {/* Warm summary line */}
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                fontStyle: 'italic',
                lineHeight: 1.35,
                color: 'var(--text-muted)',
                position: 'relative',
              }}
            >
              {warmSummary(data)}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
              <button
                className="mb-press"
                onClick={handleShare}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  borderRadius: 14,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontFamily: 'var(--sans)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                {copied ? '✓ Copied!' : '↗ Share'}
              </button>
              <button
                className="mb-press"
                onClick={onClose}
                style={{
                  padding: '13px 20px',
                  borderRadius: 14,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--sans)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stat block ──────────────────────────────────────────────────────────────
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '14px 16px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--line)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1,
          color: 'var(--accent)',
        }}
      >
        {value}
      </span>
      {unit && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          {unit}
        </span>
      )}
    </div>
  )
}
