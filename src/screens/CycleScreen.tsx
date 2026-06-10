import { useEffect, useState } from 'react'
import { Card, Eyebrow, Spinner, IconButton, toast, haptic } from '../components/ui'
import { IconChevL, IconCheck } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type Flow = 'none' | 'light' | 'medium' | 'heavy'

interface CycleLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  flow: Flow | string | null
  symptoms: string | null // comma-joined
  notes: string | null
}

interface CycleScreenProps {
  go: (screen: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RED = '0.62 0.20 20'
const FLOW_OPACITY: Record<Flow, number> = { none: 0, light: 0.4, medium: 0.7, heavy: 1 }
const FLOW_OPTIONS: { value: Flow; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
]
const SYMPTOM_OPTIONS = ['Cramps', 'Headache', 'Fatigue', 'Bloating', 'Mood swings', 'Tender breasts', 'Acne']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function flowColor(flow: Flow | string | null | undefined): string {
  const f = (flow ?? 'none') as Flow
  const op = FLOW_OPACITY[f] ?? 0
  if (op === 0) return 'var(--surface-2)'
  return `oklch(${RED} / ${op})`
}

function daysAgoFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const then = new Date(y, (m || 1) - 1, d || 1)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  then.setHours(0, 0, 0, 0)
  return Math.round((now.getTime() - then.getTime()) / 86400000)
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function CycleScreen({ go }: CycleScreenProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<CycleLog[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  // form state
  const [flow, setFlow] = useState<Flow>('none')
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const viewMonth = new Date().getMonth()
  const viewYear = new Date().getFullYear()
  const todayYMD = toYMD(new Date())

  async function load() {
    if (!user) {
      setLoading(false)
      return
    }
    const start = toYMD(new Date(viewYear, viewMonth, 1))
    // 90-day window back for insight, plus current month
    const back = new Date()
    back.setDate(back.getDate() - 120)
    const backStart = toYMD(back)
    const fetchStart = backStart < start ? backStart : start

    const [res] = await Promise.allSettled([
      supabase
        .from('cycle_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', fetchStart)
        .order('date', { ascending: true }),
    ])

    if (res.status === 'fulfilled' && !res.value.error && res.value.data) {
      setLogs(res.value.data as CycleLog[])
    } else {
      setLogs([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const logMap = new Map(logs.map((l) => [l.date, l]))

  function openDay(ymd: string) {
    const existing = logMap.get(ymd)
    setSelected(ymd)
    setFlow(((existing?.flow as Flow) ?? 'none') as Flow)
    setSymptoms(existing?.symptoms ? existing.symptoms.split(',').map((s) => s.trim()).filter(Boolean) : [])
    setNotes(existing?.notes ?? '')
  }

  function toggleSymptom(s: string) {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function save() {
    if (!user || !selected || saving) return
    setSaving(true)
    haptic()
    const { error } = await supabase.from('cycle_logs').upsert(
      {
        user_id: user.id,
        date: selected,
        flow,
        symptoms: symptoms.join(','),
        notes: notes.trim() || null,
      },
      { onConflict: 'user_id,date' }
    )
    if (error) {
      toast("Couldn't save — you're offline", { type: 'error' })
    } else {
      await load()
      setSelected(null)
      toast('Cycle day saved')
    }
    setSaving(false)
  }

  // Build calendar grid for current month
  const firstDay = new Date(viewYear, viewMonth, 1).getDay() // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toYMD(new Date(viewYear, viewMonth, d)))

  // Insight: most recent medium/heavy "period start"
  let insight: string | null = null
  const periodDays = logs
    .filter((l) => l.flow === 'medium' || l.flow === 'heavy')
    .map((l) => l.date)
    .sort()
  if (periodDays.length > 0) {
    // Find the start of the most recent contiguous run
    let startIdx = periodDays.length - 1
    for (let i = periodDays.length - 1; i > 0; i--) {
      const prevAdj = daysAgoFromYMD(periodDays[i - 1]) - daysAgoFromYMD(periodDays[i])
      if (prevAdj <= 2) startIdx = i - 1
      else break
    }
    const ago = daysAgoFromYMD(periodDays[startIdx])
    insight =
      ago === 0
        ? 'Your last period started today'
        : `Your last period started ~${ago} day${ago === 1 ? '' : 's'} ago`
  }

  const selectedLabel = selected ? (() => {
    const [y, m, d] = selected.split('-').map(Number)
    return `${MONTHS[(m || 1) - 1]} ${d}, ${y}`
  })() : ''

  return (
    <div
      className="mb-screen"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '56px 20px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <IconButton label="Back" onClick={() => go('back')} style={{ color: 'var(--text-muted)', marginLeft: -10 }}>
          <IconChevL size={22} />
        </IconButton>
        <h1
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            margin: 0,
            pointerEvents: 'none',
          }}
        >
          Cycle
        </h1>
      </div>

      <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)', margin: '-6px 0 0', textAlign: 'center' }}>
        Private cycle tracking to spot patterns with mood and energy.
      </p>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
          <Spinner />
        </div>
      ) : (
        <>
          {insight && (
            <Card style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--text)' }}>{insight}</span>
            </Card>
          )}

          {/* Calendar */}
          <Card>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 500, color: 'var(--text)', marginBottom: 14 }}>
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
              {WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--text-dim)',
                  }}
                >
                  {w}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((ymd, i) => {
                if (!ymd) return <div key={`e${i}`} />
                const log = logMap.get(ymd)
                const dayNum = Number(ymd.split('-')[2])
                const isToday = ymd === todayYMD
                const dotColor = flowColor(log?.flow)
                const hasFlow = log && log.flow && log.flow !== 'none'
                return (
                  <button
                    key={ymd}
                    onClick={() => openDay(ymd)}
                    style={{
                      aspectRatio: '1',
                      background: 'none',
                      border: isToday ? '1px solid var(--accent-line)' : '1px solid transparent',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--sans)',
                        fontSize: 13,
                        color: isToday ? 'var(--accent)' : 'var(--text)',
                        fontWeight: isToday ? 600 : 400,
                        lineHeight: 1,
                      }}
                    >
                      {dayNum}
                    </span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: hasFlow ? dotColor : 'transparent',
                      }}
                    />
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Day editor */}
          {selected && (
            <Card style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                  {selectedLabel}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-dim)', padding: 4 }}
                >
                  Cancel
                </button>
              </div>

              {/* Flow */}
              <div>
                <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Flow</Eyebrow>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {FLOW_OPTIONS.map((opt) => {
                    const active = flow === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFlow(opt.value)}
                        style={{
                          flex: 1,
                          minWidth: 64,
                          background: active ? `oklch(${RED} / ${opt.value === 'none' ? 0.18 : FLOW_OPACITY[opt.value]})` : 'var(--surface-2)',
                          border: active ? `1px solid oklch(${RED})` : '1px solid var(--line)',
                          borderRadius: 14,
                          padding: '9px 8px',
                          cursor: 'pointer',
                          fontFamily: 'var(--sans)',
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          color: active && opt.value !== 'none' && opt.value !== 'light' ? '#fff' : 'var(--text)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Symptoms */}
              <div>
                <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Symptoms</Eyebrow>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SYMPTOM_OPTIONS.map((s) => {
                    const active = symptoms.includes(s)
                    return (
                      <button
                        key={s}
                        onClick={() => toggleSymptom(s)}
                        style={{
                          background: active ? 'var(--accent)' : 'var(--surface-2)',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
                          borderRadius: 999,
                          padding: '7px 14px',
                          cursor: 'pointer',
                          fontFamily: 'var(--sans)',
                          fontSize: 12,
                          fontWeight: active ? 600 : 400,
                          color: active ? 'var(--on-accent)' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {active && <IconCheck size={12} />}
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Notes</Eyebrow>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional…"
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    color: 'var(--text)',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: saving ? 'var(--surface-2)' : 'var(--accent)',
                  color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 14,
                  padding: '13px',
                  cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'var(--sans)',
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'background 0.15s ease',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
