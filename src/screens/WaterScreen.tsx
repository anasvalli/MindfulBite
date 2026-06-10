import React, { useEffect, useState } from 'react'
import { Card, Eyebrow, Spinner, Ring, IconButton, toast, haptic } from '../components/ui'
import { IconChevL, IconPlus } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { localDateKey, dayLabel2 } from '../lib/dates'

// Local water glyphs (line icons, stroke = currentColor) — replaces the old
// 🥛/🍶 emoji which read as milk and sake, not water.
function GlyphCup({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12l-1.2 14.5a2 2 0 0 1-2 1.5H9.2a2 2 0 0 1-2-1.5L6 4z" />
      <path d="M6.8 11h10.4" />
    </svg>
  )
}
function GlyphBottle({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2h4" />
      <path d="M10.5 2v3.2L8.6 8.4A3 3 0 0 0 8 10.2V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8.8a3 3 0 0 0-.6-1.8l-1.9-3.2V2" />
      <path d="M8 13.5h8" />
    </svg>
  )
}
function GlyphDrop({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z" />
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaterLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  amount_ml: number
  logged_at: string
}

interface WaterScreenProps {
  go: (screen: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WATER_COLOR = 'oklch(0.74 0.10 230)'
const WATER_TRACK = 'oklch(0.74 0.10 230 / 0.16)'
const GOAL_ML = 2000

const QUICK_ADDS: { label: string; glyph: React.ReactNode; ml: number }[] = [
  { label: 'Glass', glyph: <GlyphCup />, ml: 250 },
  { label: 'Bottle', glyph: <GlyphBottle />, ml: 500 },
  { label: 'Large', glyph: <GlyphDrop />, ml: 750 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toYMD = localDateKey

function formatLiters(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`
  }
  return `${ml}ml`
}

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function WaterScreen({ go }: WaterScreenProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [todayLogs, setTodayLogs] = useState<WaterLog[]>([])
  const [weekLogs, setWeekLogs] = useState<WaterLog[]>([])

  const today = toYMD(new Date())

  async function load() {
    if (!user) {
      setLoading(false)
      return
    }
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekStart = toYMD(weekAgo)

    const [todayRes, weekRes] = await Promise.allSettled([
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('logged_at', { ascending: false }),
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', weekStart)
        .lte('date', today),
    ])

    if (todayRes.status === 'fulfilled' && !todayRes.value.error && todayRes.value.data) {
      setTodayLogs(todayRes.value.data as WaterLog[])
    } else {
      setTodayLogs([])
    }
    if (weekRes.status === 'fulfilled' && !weekRes.value.error && weekRes.value.data) {
      setWeekLogs(weekRes.value.data as WaterLog[])
    } else {
      setWeekLogs([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function addWater(ml: number) {
    if (!user || adding) return
    setAdding(true)
    haptic()
    // Optimistic: show the log immediately, roll back if the insert fails.
    const tempId = `temp-${Math.random().toString(36).slice(2)}`
    const optimistic: WaterLog = {
      id: tempId,
      user_id: user.id,
      date: today,
      amount_ml: ml,
      logged_at: new Date().toISOString(),
    }
    setTodayLogs((prev) => [optimistic, ...prev])
    const { data, error } = await supabase
      .from('water_logs')
      .insert({ user_id: user.id, date: today, amount_ml: ml })
      .select()
      .single()
    if (error || !data) {
      setTodayLogs((prev) => prev.filter((l) => l.id !== tempId))
      toast("Couldn't save — you're offline", { type: 'error' })
    } else {
      const saved = data as WaterLog
      setTodayLogs((prev) => prev.map((l) => (l.id === tempId ? saved : l)))
      setWeekLogs((prev) => [...prev, saved])
      toast(`${ml}ml logged`, { action: { label: 'Undo', onClick: () => undo(saved.id) } })
    }
    setAdding(false)
  }

  async function undo(id: string) {
    if (!user) return
    // Optimistic removal with rollback.
    const removed = todayLogs.find((l) => l.id === id)
    setTodayLogs((prev) => prev.filter((l) => l.id !== id))
    setWeekLogs((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase.from('water_logs').delete().eq('id', id)
    if (error) {
      if (removed) setTodayLogs((prev) => [removed, ...prev])
      toast("Couldn't undo — you're offline", { type: 'error' })
    }
  }

  const total = todayLogs.reduce((s, l) => s + (l.amount_ml || 0), 0)
  const progress = GOAL_ML > 0 ? total / GOAL_ML : 0

  // Build last-7-days totals
  const weekMap = new Map<string, number>()
  for (const l of weekLogs) {
    weekMap.set(l.date, (weekMap.get(l.date) || 0) + (l.amount_ml || 0))
  }
  const weekData: { label: string; ml: number; isToday: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ymd = toYMD(d)
    weekData.push({
      label: dayLabel2(ymd),
      ml: weekMap.get(ymd) || 0,
      isToday: i === 0,
    })
  }
  const weekMax = Math.max(...weekData.map((d) => d.ml), GOAL_ML)
  const [selectedBar, setSelectedBar] = useState<number | null>(null)

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
          Water
        </h1>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* Ring */}
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Ring size={160} stroke={14} progress={progress} color={WATER_COLOR} track={WATER_TRACK}>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 34,
                    fontWeight: 500,
                    color: 'var(--text)',
                    lineHeight: 1,
                  }}
                >
                  {formatLiters(total)}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text-dim)',
                    marginTop: 6,
                  }}
                >
                  of {formatLiters(GOAL_ML)}
                </div>
              </div>
            </Ring>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)' }}>
              {total >= GOAL_ML
                ? 'Goal reached — nicely hydrated 💧'
                : `${formatLiters(GOAL_ML - total)} to go`}
            </div>
          </Card>

          {/* Quick add */}
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Quick add</Eyebrow>
            <div style={{ display: 'flex', gap: 10 }}>
              {QUICK_ADDS.map((q) => (
                <button
                  key={q.ml}
                  onClick={() => addWater(q.ml)}
                  disabled={adding}
                  style={{
                    flex: 1,
                    background: 'var(--surface)',
                    border: `1px solid ${WATER_COLOR}`,
                    borderRadius: 18,
                    padding: '14px 8px',
                    cursor: adding ? 'default' : 'pointer',
                    opacity: adding ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <span style={{ color: WATER_COLOR, display: 'flex', lineHeight: 1 }}>{q.glyph}</span>
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: WATER_COLOR,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <IconPlus size={12} />
                    {q.ml}ml
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Today's entries */}
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Today</Eyebrow>
            {todayLogs.length === 0 ? (
              <Card style={{ textAlign: 'center', padding: 22 }}>
                <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-dim)' }}>
                  No water logged yet. Tap a button above to start.
                </span>
              </Card>
            ) : (
              <Card pad={0} style={{ overflow: 'hidden' }}>
                {todayLogs.map((l, i) => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: WATER_COLOR,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {l.amount_ml}ml
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                      {formatLogTime(l.logged_at)}
                    </span>
                    <button
                      onClick={() => undo(l.id)}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'var(--sans)',
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        padding: 4,
                      }}
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Weekly chart */}
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Last 7 days</Eyebrow>
            <Card>
              {selectedBar !== null && weekData[selectedBar] && (
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    textAlign: 'center',
                  }}
                >
                  {weekData[selectedBar].label}: {formatLiters(weekData[selectedBar].ml)}
                  {' · '}
                  {weekData[selectedBar].ml >= GOAL_ML
                    ? 'goal hit 💧'
                    : `${formatLiters(GOAL_ML - weekData[selectedBar].ml)} short of goal`}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                {/* 2L goal line */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 26 + (GOAL_ML / weekMax) * 80,
                    borderTop: `1.5px dashed ${WATER_COLOR}`,
                    opacity: 0.55,
                    pointerEvents: 'none',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 28 + (GOAL_ML / weekMax) * 80,
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    color: WATER_COLOR,
                    opacity: 0.8,
                    pointerEvents: 'none',
                  }}
                >
                  2L
                </span>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 106, gap: 8 }}>
                  {weekData.map((d, i) => (
                    <button
                      key={i}
                      aria-label={`${d.label}: ${formatLiters(d.ml)}`}
                      onClick={() => setSelectedBar(selectedBar === i ? null : i)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 6,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 28,
                          height: Math.max(4, (d.ml / weekMax) * 80),
                          background: d.isToday || selectedBar === i ? WATER_COLOR : WATER_TRACK,
                          borderRadius: 5,
                          transition: 'height 0.5s ease',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          color: d.isToday ? WATER_COLOR : 'var(--text-dim)',
                          fontWeight: d.isToday ? 600 : 400,
                        }}
                      >
                        {d.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
