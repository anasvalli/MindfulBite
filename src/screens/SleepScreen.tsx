import { useEffect, useState } from 'react'
import { Ring, Card, Eyebrow, Spinner, IconButton, toast, haptic } from '../components/ui'
import { IconMoon, IconChevL, IconClose } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { localDateKey, dayLabel2 } from '../lib/dates'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SleepLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  bedtime: string | null // HH:MM
  wake_time: string | null
  duration_minutes: number | null
  quality_score: number | null
  notes: string | null
  created_at: string
}

interface SleepScreenProps {
  go: (screen: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLEEP_COLOR = 'oklch(0.74 0.08 265)'
const SLEEP_COLOR_WASH = 'oklch(0.74 0.08 265 / 0.15)'
const SLEEP_COLOR_BORDER = 'oklch(0.74 0.08 265)'
const WARN_COLOR = 'oklch(0.76 0.09 30)'

const QUALITY_LABELS: Record<number, string> = {
  5: 'Excellent',
  4: 'Good',
  3: 'Fair',
  2: 'Poor',
  1: 'Bad',
}

const QUALITY_EMOJIS: Record<number, string> = {
  1: '😴',
  2: '😐',
  3: '🙂',
  4: '😊',
  5: '✨',
}

const QUALITY_OPTION_LABELS: Record<number, string> = {
  1: 'Awful',
  2: 'Poor',
  3: 'Fair',
  4: 'Good',
  5: 'Excellent',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Local-timezone day key (the old toISOString() version bucketed by UTC, which
// shifted sleep onto the wrong weekday for anyone east of Greenwich).
const toYMD = localDateKey

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTime(hhmm: string | null): string {
  if (!hhmm) return '—'
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function calcDurationMinutes(bedtime: string, wakeTime: string): number {
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let bedMins = bh * 60 + bm
  let wakeMins = wh * 60 + wm
  if (wakeMins <= bedMins) wakeMins += 24 * 60
  return wakeMins - bedMins
}

function qualityColor(score: number | null): string {
  if (score == null) return 'var(--text-muted)'
  if (score >= 4) return SLEEP_COLOR
  if (score === 3) return 'var(--text-muted)'
  return WARN_COLOR
}

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toYMD(d)
}

function getSevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return toYMD(d)
}

// Get Mon-Sun labels for the last 7 days ending today
function getWeekDayData(logs: SleepLog[]): { label: string; minutes: number; isToday: boolean }[] {
  const days: { label: string; minutes: number; isToday: boolean }[] = []
  const today = new Date()
  // Build a map of date → log
  const logMap = new Map(logs.map((l) => [l.date, l]))

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const ymd = toYMD(d)
    const log = logMap.get(ymd)
    days.push({
      label: dayLabel2(ymd),
      minutes: log?.duration_minutes ?? 0,
      isToday: i === 0,
    })
  }
  return days
}

function coachTip(logs: SleepLog[]): string {
  if (logs.length === 0) {
    return 'Log your first night of sleep to start seeing personalised insights.'
  }
  // Never claim a "trend" from fewer than 3 nights — be honest about the
  // sample size and turn it into a logging incentive instead.
  if (logs.length < 3) {
    const remaining = 3 - logs.length
    return `${logs.length} of 7 nights logged — ${remaining} more and I can read your consistency.`
  }
  const withDuration = logs.filter((l) => l.duration_minutes != null)
  const withQuality = logs.filter((l) => l.quality_score != null)
  const avgDuration =
    withDuration.length > 0
      ? withDuration.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / withDuration.length
      : null
  const avgQuality =
    withQuality.length > 0
      ? withQuality.reduce((s, l) => s + (l.quality_score ?? 0), 0) / withQuality.length
      : null

  if (avgDuration != null && avgDuration < 420) {
    return "You're averaging under 7 hours this week. Try moving bedtime 30 minutes earlier."
  }
  if (avgQuality != null && avgQuality < 3) {
    return 'Sleep quality has been low. Lighter dinners and less screen time before bed can help.'
  }
  return 'Great consistency this week. Keep your sleep schedule steady for the best recovery.'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SleepScreen({ go }: SleepScreenProps) {
  const { user } = useAuth()

  // Data state
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableError, setTableError] = useState(false)

  // Form state
  const [showLog, setShowLog] = useState(false)
  const [formDate, setFormDate] = useState(getYesterday())
  const [formBedtime, setFormBedtime] = useState('23:00')
  const [formWakeTime, setFormWakeTime] = useState('07:00')
  const [formQuality, setFormQuality] = useState<number>(4)
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ─── Fetch logs ──────────────────────────────────────────────────────────────

  async function fetchLogs() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', getSevenDaysAgo())
        .order('date', { ascending: false })

      if (fetchErr) {
        // Table doesn't exist yet
        if (
          fetchErr.code === '42P01' ||
          fetchErr.message?.toLowerCase().includes('does not exist') ||
          fetchErr.message?.toLowerCase().includes('relation')
        ) {
          setTableError(true)
        } else {
          setError(fetchErr.message)
        }
        setLogs([])
      } else {
        setLogs(data ?? [])
        setTableError(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sleep data')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // ─── Computed values ──────────────────────────────────────────────────────────

  const today = toYMD(new Date())
  const yesterday = getYesterday()

  const heroLog = logs.find((l) => l.date === today) ?? logs.find((l) => l.date === yesterday) ?? null

  const weekDays = getWeekDayData(logs)
  const maxBar = 600 // 10 hours cap
  const barH = 70

  const withDuration = logs.filter((l) => l.duration_minutes != null)
  const avgDurationMins =
    withDuration.length > 0
      ? Math.round(withDuration.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / withDuration.length)
      : null

  // ─── Save handler ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setSaveError(null)

    const durationMins =
      formBedtime && formWakeTime ? calcDurationMinutes(formBedtime, formWakeTime) : null

    try {
      const { error: upsertErr } = await supabase.from('sleep_logs').upsert(
        {
          user_id: user.id,
          date: formDate,
          bedtime: formBedtime || null,
          wake_time: formWakeTime || null,
          duration_minutes: durationMins,
          quality_score: formQuality,
          notes: formNotes.trim() || null,
        },
        { onConflict: 'user_id,date' }
      )

      if (upsertErr) {
        setSaveError("Couldn't save — check your connection and try again.")
        toast("Couldn't save — you're offline", { type: 'error' })
      } else {
        haptic()
        toast(`Sleep logged — ${formatDuration(durationMins)}`)
        await fetchLogs()
        setShowLog(false)
        // Reset form
        setFormDate(getYesterday())
        setFormBedtime('23:00')
        setFormWakeTime('07:00')
        setFormQuality(4)
        setFormNotes('')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ─── Input style helpers ──────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '10px 12px',
    color: 'var(--text)',
    fontFamily: 'var(--sans)',
    fontSize: 14,
    outline: 'none',
    colorScheme: 'dark',
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ─── Main Screen ─────────────────────────────────────────────────────── */}
      <div className="mb-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <IconButton label="Back" onClick={() => go('back')} style={{ color: 'var(--text-muted)', marginLeft: -10 }}>
            <IconChevL size={22} />
          </IconButton>

          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 2 }}>
              LAST NIGHT
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--text)',
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              Sleep
            </div>
          </div>

          <IconButton label="Log sleep" onClick={() => setShowLog(true)} style={{ marginLeft: 'auto', marginRight: -10, color: SLEEP_COLOR }}>
            <IconMoon size={20} />
          </IconButton>
        </div>

        {/* Table error */}
        {tableError && (
          <Card style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Sleep tracking not yet set up. The <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>sleep_logs</code> table is missing from your database.
            </p>
          </Card>
        )}

        {/* Generic error */}
        {error && !tableError && (
          <Card>
            <p style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
          </Card>
        )}

        {/* Loading state */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Spinner size={40} />
          </div>
        ) : (
          <>
            {/* ─── Hero Card ──────────────────────────────────────────────── */}
            {heroLog ? (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  {/* Ring */}
                  <Ring
                    size={130}
                    stroke={11}
                    progress={heroLog.quality_score != null ? heroLog.quality_score / 5 : 0}
                    color={SLEEP_COLOR}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontFamily: 'var(--serif)',
                          fontSize: 36,
                          fontWeight: 500,
                          color: 'var(--text)',
                          lineHeight: 1,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {heroLog.quality_score != null ? heroLog.quality_score * 20 : '—'}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: 'var(--text-dim)',
                          fontFamily: 'var(--mono)',
                          marginTop: 3,
                          letterSpacing: '0.12em',
                        }}
                      >
                        SCORE
                      </div>
                    </div>
                  </Ring>

                  {/* Right side */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--serif)',
                        fontSize: 38,
                        fontWeight: 500,
                        color: 'var(--text)',
                        letterSpacing: '-0.02em',
                        lineHeight: 1,
                        marginBottom: 4,
                      }}
                    >
                      {formatDuration(heroLog.duration_minutes)}
                    </div>
                    {heroLog.quality_score != null && (
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: qualityColor(heroLog.quality_score),
                          marginBottom: 8,
                        }}
                      >
                        {QUALITY_LABELS[heroLog.quality_score] ?? '—'}
                      </div>
                    )}
                    {(heroLog.bedtime || heroLog.wake_time) && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-dim)',
                          fontFamily: 'var(--mono)',
                          lineHeight: 1.6,
                        }}
                      >
                        {formatTime(heroLog.bedtime)} – {formatTime(heroLog.wake_time)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ) : !tableError && !error ? (
              <Card style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    No sleep logged yet
                  </p>
                  <button
                    onClick={() => setShowLog(true)}
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      border: 'none',
                      borderRadius: 14,
                      padding: '13px 24px',
                      minHeight: 44,
                      fontFamily: 'var(--sans)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Log Last Night
                  </button>
                </div>
              </Card>
            ) : null}

            {/* ─── Weekly Bars Card ────────────────────────────────────────── */}
            {!tableError && !error && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Eyebrow>This Week</Eyebrow>
                  {avgDurationMins != null && (
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: 'var(--mono)',
                        color: SLEEP_COLOR,
                      }}
                    >
                      avg {formatDuration(avgDurationMins)}
                    </span>
                  )}
                </div>

                {/* Bars with the 7–9h healthy-range band behind them */}
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 4,
                    height: barH,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: (420 / maxBar) * barH,
                      height: ((540 - 420) / maxBar) * barH,
                      background: SLEEP_COLOR_WASH,
                      borderTop: `1px dashed ${SLEEP_COLOR}`,
                      borderBottom: `1px dashed ${SLEEP_COLOR}`,
                      opacity: 0.6,
                      pointerEvents: 'none',
                      borderRadius: 2,
                    }}
                  />
                  {weekDays.map((day, i) => {
                    const heightPct = Math.min(day.minutes / maxBar, 1)
                    const barHeight = Math.max(day.minutes > 0 ? 6 : 2, heightPct * barH)
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 3 }}>
                        {day.minutes > 0 && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: day.isToday ? SLEEP_COLOR : 'var(--text-dim)' }}>
                            {(day.minutes / 60).toFixed(day.minutes % 60 === 0 ? 0 : 1)}h
                          </span>
                        )}
                        <div
                          style={{
                            width: '100%',
                            height: barHeight,
                            background: day.isToday ? SLEEP_COLOR : 'var(--surface-2)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.5s ease',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Day labels */}
                <div style={{ display: 'flex' }}>
                  {weekDays.map((day, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontSize: 10,
                        fontFamily: 'var(--mono)',
                        color: day.isToday ? SLEEP_COLOR : 'var(--text-dim)',
                      }}
                    >
                      {day.label}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ─── Coach Tip ───────────────────────────────────────────────── */}
            {!tableError && !error && (
              <Card
                style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', cursor: 'pointer' }}
                onClick={() => go('coach')}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--on-accent)',
                    }}
                  >
                    🌿
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        color: 'var(--accent)',
                        fontFamily: 'var(--mono)',
                        marginBottom: 5,
                      }}
                    >
                      SLEEP INSIGHT
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {coachTip(logs)}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ─── Log Form Overlay ─────────────────────────────────────────────────── */}
      {showLog && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLog(false)
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '28px 28px 0 0',
              padding: '24px 20px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxHeight: '88%',
              overflowY: 'auto',
            }}
          >
            {/* Form header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 22,
                  fontWeight: 500,
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                }}
              >
                Log Your Sleep
              </div>
              <IconButton label="Close" onClick={() => setShowLog(false)} style={{ color: 'var(--text-muted)', marginTop: -8, marginRight: -8 }}>
                <IconClose size={20} />
              </IconButton>
            </div>

            {/* Date picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase',
                }}
              >
                Which night?
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Time fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  Bedtime
                </label>
                <input
                  type="time"
                  value={formBedtime}
                  onChange={(e) => setFormBedtime(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  Woke up
                </label>
                <input
                  type="time"
                  value={formWakeTime}
                  onChange={(e) => setFormWakeTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Duration preview */}
            {formBedtime && formWakeTime && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: SLEEP_COLOR,
                  fontFamily: 'var(--mono)',
                  marginTop: -8,
                }}
              >
                {formatDuration(calcDurationMinutes(formBedtime, formWakeTime))} of sleep
              </div>
            )}

            {/* Quality selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase',
                }}
              >
                Sleep Quality
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {([1, 2, 3, 4, 5] as const).map((score) => {
                  const selected = formQuality === score
                  return (
                    <button
                      key={score}
                      onClick={() => setFormQuality(score)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 4px',
                        borderRadius: 12,
                        fontSize: 11,
                        cursor: 'pointer',
                        width: '100%',
                        border: selected
                          ? `1px solid ${SLEEP_COLOR_BORDER}`
                          : '1px solid var(--line)',
                        background: selected ? SLEEP_COLOR_WASH : 'var(--surface-2)',
                        color: selected ? SLEEP_COLOR : 'var(--text-dim)',
                        fontFamily: 'var(--sans)',
                        fontWeight: selected ? 600 : 400,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{QUALITY_EMOJIS[score]}</span>
                      <span>{QUALITY_OPTION_LABELS[score]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase',
                }}
              >
                Notes (optional)
              </label>
              <textarea
                rows={3}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="How did you feel when you woke up?"
                style={{
                  ...inputStyle,
                  resize: 'none',
                  lineHeight: 1.6,
                }}
              />
            </div>

            {/* Save error */}
            {saveError && (
              <p style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{saveError}</p>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                height: 52,
                background: saving ? 'var(--surface-2)' : 'var(--accent)',
                color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
                border: 'none',
                borderRadius: 16,
                fontFamily: 'var(--sans)',
                fontWeight: 700,
                fontSize: 15,
                cursor: saving ? 'default' : 'pointer',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.15s ease',
              }}
            >
              {saving ? <Spinner size={20} /> : 'Save Sleep Log'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
