import { useEffect, useState } from 'react'
import { Card, Eyebrow, Spinner, IconButton, toast, haptic } from '../components/ui'
import { IconChevL } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { localDateKey } from '../lib/dates'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeightLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  weight_kg: number
}

interface WeightScreenProps {
  go: (screen: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toYMD = localDateKey

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[(m || 1) - 1]} ${d}`
}

// ─── Trend Chart ────────────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 140
const PAD_X = 10
const PAD_Y = 16

function TrendChart({ logs, goal }: { logs: WeightLog[]; goal: number | null }) {
  if (logs.length < 2) {
    return (
      <Card style={{ textAlign: 'center', padding: 28 }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-dim)' }}>
          Log more to see your trend
        </span>
      </Card>
    )
  }

  const weights = logs.map((l) => l.weight_kg)
  const considered = goal != null ? [...weights, goal] : weights
  const minVal = Math.min(...considered)
  const maxVal = Math.max(...considered)
  const range = maxVal - minVal || 1

  const n = logs.length
  const xFor = (i: number) => PAD_X + (i / (n - 1)) * (CHART_W - PAD_X * 2)
  const yFor = (v: number) => PAD_Y + (1 - (v - minVal) / range) * (CHART_H - PAD_Y * 2)

  const points = logs.map((l, i) => ({ x: xFor(i), y: yFor(l.weight_kg) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath =
    `M${points[0].x.toFixed(1)} ${(CHART_H - PAD_Y).toFixed(1)} ` +
    points.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L${points[points.length - 1].x.toFixed(1)} ${(CHART_H - PAD_Y).toFixed(1)} Z`

  const goalY = goal != null ? yFor(goal) : null

  const actualMin = Math.min(...weights)
  const actualMax = Math.max(...weights)

  return (
    <Card>
      <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {goalY != null && (
          <>
            <line
              x1={PAD_X}
              y1={goalY}
              x2={CHART_W - PAD_X}
              y2={goalY}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.6}
            />
            <text
              x={CHART_W - PAD_X}
              y={goalY - 4}
              textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--accent)' }}
            >
              goal {goal}
            </text>
          </>
        )}

        <path d={areaPath} fill="url(#weightFill)" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--accent)" />
        ))}

        <text x={PAD_X} y={11} style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--text-dim)' }}>
          {actualMax.toFixed(1)}
        </text>
        <text x={PAD_X} y={CHART_H - 4} style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--text-dim)' }}>
          {actualMin.toFixed(1)}
        </text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {shortDate(logs[0].date)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {shortDate(logs[n - 1].date)}
        </span>
      </div>
    </Card>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function WeightScreen({ go }: WeightScreenProps) {
  const { user, profile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [input, setInput] = useState('')

  const goalWeight = profile?.goal_weight ?? null

  async function load() {
    if (!user) {
      setLoading(false)
      return
    }
    const [res] = await Promise.allSettled([
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(30),
    ])

    if (res.status === 'fulfilled' && !res.value.error && res.value.data) {
      // Reverse so oldest → newest for chart
      const rows = (res.value.data as WeightLog[]).slice().reverse()
      setLogs(rows)
    } else {
      setLogs([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function save() {
    if (!user || saving) return
    const val = parseFloat(input)
    if (!isFinite(val) || val <= 0) return
    setSaving(true)
    haptic()
    const today = toYMD(new Date())

    const upsertRes = await supabase
      .from('weight_logs')
      .upsert({ user_id: user.id, date: today, weight_kg: val }, { onConflict: 'user_id,date' })

    if (upsertRes.error) {
      toast("Couldn't save — you're offline", { type: 'error' })
    } else {
      // Keep users.weight in sync with latest entry
      await supabase.from('users').update({ weight: val }).eq('id', user.id)
      setInput('')
      await load()
      toast(`Weight logged — ${val} kg`)
      try {
        await refreshProfile()
      } catch {
        /* non-fatal */
      }
    }
    setSaving(false)
  }

  // latest = last element (newest)
  const latest = logs.length > 0 ? logs[logs.length - 1] : null
  const current = latest?.weight_kg ?? profile?.weight ?? null

  let toGoal: number | null = null
  if (current != null && goalWeight != null) {
    toGoal = Math.round((current - goalWeight) * 10) / 10
  }

  return (
    <div
      className="mb-screen"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '56px 20px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
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
          Weight
        </h1>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* Current */}
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Eyebrow>Current</Eyebrow>
            {current != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 46, fontWeight: 500, color: 'var(--text)', lineHeight: 1 }}>
                    {current % 1 === 0 ? current.toFixed(0) : current.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: 16, color: 'var(--text-muted)' }}>kg</span>
                </div>
                {toGoal != null && (
                  <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {Math.abs(toGoal) < 0.05
                      ? 'At your goal weight 🎯'
                      : `${Math.abs(toGoal)} kg ${toGoal > 0 ? 'to goal' : 'below goal'}`}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--text-dim)', marginTop: 6 }}>
                No weight logged yet
              </span>
            )}
          </Card>

          {/* Trend */}
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Trend · last 30</Eyebrow>
            <TrendChart logs={logs} goal={goalWeight} />
          </div>

          {/* Log today */}
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Log today's weight</Eyebrow>
            <Card style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={current != null ? String(current) : '0.0'}
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                    padding: '12px 44px 12px 14px',
                    color: 'var(--text)',
                    fontFamily: 'var(--mono)',
                    fontSize: 16,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    pointerEvents: 'none',
                  }}
                >
                  kg
                </span>
              </div>
              <button
                onClick={save}
                disabled={saving || !input}
                style={{
                  background: saving || !input ? 'var(--surface-2)' : 'var(--accent)',
                  color: saving || !input ? 'var(--text-dim)' : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 14,
                  padding: '12px 22px',
                  cursor: saving || !input ? 'default' : 'pointer',
                  fontFamily: 'var(--sans)',
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'background 0.15s ease',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
