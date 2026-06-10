import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Meal } from '../types'
import { Card, Eyebrow, MacroBar, Spinner, IconButton } from '../components/ui'
import { IconChevL, IconClose, IconCamera } from '../components/icons'
import { macroTargets } from '../lib/targets'
import { aggregateDays, type DayAgg } from '../lib/aggregate'

interface NutritionScreenProps {
  go: (screen: string) => void
}

type Metric = 'calories' | 'protein' | 'carbs' | 'fat'
const METRICS: { key: Metric; label: string; unit: string; color: string }[] = [
  { key: 'calories', label: 'Cal', unit: 'kcal', color: 'var(--accent)' },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'oklch(0.75 0.12 180)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: 'oklch(0.72 0.14 85)' },
  { key: 'fat', label: 'Fat', unit: 'g', color: 'oklch(0.70 0.12 55)' },
]

export function NutritionScreen({ go }: NutritionScreenProps) {
  const { user, profile } = useAuth()
  const [todayMeals, setTodayMeals] = useState<Meal[]>([])
  const [days, setDays] = useState<DayAgg[]>([])
  const [range, setRange] = useState<7 | 30>(7)
  const [metric, setMetric] = useState<Metric>('calories')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // One source of truth for every target on this screen.
  const targets = macroTargets(profile)
  const goal = targets.calories
  const eaten = todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProtein = todayMeals.reduce((s, m) => s + (m.macros_json?.protein ?? 0), 0)
  const totalCarbs = todayMeals.reduce((s, m) => s + (m.macros_json?.carbs ?? 0), 0)
  const totalFat = todayMeals.reduce((s, m) => s + (m.macros_json?.fat ?? 0), 0)

  useEffect(() => {
    if (!user) return
    const uid = user.id

    async function load() {
      try {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)

        const [todayRes, agg] = await Promise.all([
          supabase
            .from('meals')
            .select('*')
            .eq('user_id', uid)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: false }),
          aggregateDays(uid, 30),
        ])

        if (todayRes.data) setTodayMeals(todayRes.data as Meal[])
        setDays(agg)
      } catch (err) {
        console.warn('NutritionScreen load error:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  function toggleExpand(mealId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(mealId)) {
        next.delete(mealId)
      } else {
        next.add(mealId)
      }
      return next
    })
  }

  async function handleDelete(mealId: string) {
    if (deletingId) return
    setDeletingId(mealId)
    try {
      const { error } = await supabase.from('meals').delete().eq('id', mealId)
      if (error) {
        console.warn('Delete meal error:', error.message)
      } else {
        setTodayMeals((prev) => prev.filter((m) => m.id !== mealId))
        setExpandedIds((prev) => {
          const next = new Set(prev)
          next.delete(mealId)
          return next
        })
      }
    } catch (err) {
      console.warn('Delete meal exception:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mb-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton label="Back" onClick={() => go('back')} style={{ color: 'var(--text-muted)', marginLeft: -10 }}>
          <IconChevL size={22} />
        </IconButton>
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}
        >
          Nutrition
        </h2>
      </div>

      {/* Hero calories */}
      <Card style={{ textAlign: 'center', padding: '28px 18px' }}>
        <Eyebrow style={{ marginBottom: 8, display: 'block' }}>Today's Calories</Eyebrow>
        <div
          className="mb-num"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 60,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {Math.round(eaten)}
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, fontFamily: 'var(--mono)' }}>
          of {Math.round(goal)} kcal goal
        </p>
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              height: 6,
              borderRadius: 4,
              background: 'var(--surface-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(1, eaten / goal) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Macro Donuts */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>Macronutrients</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MacroBar label="Protein" value={totalProtein} goal={targets.protein} color="oklch(0.75 0.12 180)" />
          <MacroBar label="Carbs" value={totalCarbs} goal={targets.carbs} color="oklch(0.72 0.14 85)" />
          <MacroBar label="Fat" value={totalFat} goal={targets.fat} color="oklch(0.70 0.12 55)" />
        </div>
      </Card>

      {/* Trend chart — pick a metric, see it against the goal */}
      <Card>
        {(() => {
          const m = METRICS.find((x) => x.key === metric)!
          const goalFor: Record<Metric, number> = {
            calories: targets.calories,
            protein: targets.protein,
            carbs: targets.carbs,
            fat: targets.fat,
          }
          const view = days.slice(-range)
          const values = view.map((d) => d[metric])
          const maxVal = Math.max(...values, goalFor[metric])
          const H = 84
          const sel = selectedDay !== null && view[selectedDay] ? selectedDay : null
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Eyebrow>{range === 7 ? 'This Week' : 'Last 30 Days'}</Eyebrow>
                <button
                  onClick={() => { setRange(range === 7 ? 30 : 7); setSelectedDay(null) }}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  {range === 7 ? '7d' : '30d'}
                </button>
              </div>

              {/* Metric chips */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {METRICS.map((x) => (
                  <button
                    key={x.key}
                    onClick={() => { setMetric(x.key); setSelectedDay(null) }}
                    style={{
                      background: metric === x.key ? x.color : 'var(--surface-2)',
                      color: metric === x.key ? 'var(--on-accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 10,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontFamily: 'var(--sans)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {x.label}
                  </button>
                ))}
              </div>

              {/* Selected-bar readout */}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, minHeight: 16, textAlign: 'center' }}>
                {sel !== null
                  ? `${view[sel].label}: ${Math.round(view[sel][metric])} ${m.unit} · ${view[sel][metric] >= goalFor[metric] ? '+' : '−'}${Math.abs(Math.round(view[sel][metric] - goalFor[metric]))} vs goal`
                  : `${m.label} eaten per day — dashed line is your ${Math.round(goalFor[metric])} ${m.unit} goal`}
              </div>

              {/* Bars + goal line */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: (range === 7 ? 22 : 4) + (goalFor[metric] / maxVal) * H,
                    borderTop: `1.5px dashed ${m.color}`,
                    opacity: 0.55,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: range === 7 ? 6 : 2, height: H + (range === 7 ? 22 : 4) }}>
                  {view.map((d, i) => (
                    <button
                      key={d.date}
                      aria-label={`${d.label}: ${Math.round(d[metric])} ${m.unit}`}
                      onClick={() => setSelectedDay(sel === i ? null : i)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        height: '100%',
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: range === 7 ? 30 : 10,
                          height: Math.max(3, (d[metric] / maxVal) * H),
                          background: i === view.length - 1 || sel === i ? m.color : 'var(--surface-2)',
                          borderRadius: 4,
                          transition: 'height 0.5s ease',
                        }}
                      />
                      {range === 7 && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: i === view.length - 1 ? m.color : 'var(--text-dim)' }}>
                          {d.label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )
        })()}
      </Card>

      {/* Today's Meals */}
      <div>
        <Eyebrow style={{ display: 'block', marginBottom: 12 }}>Today's Meals</Eyebrow>
        {todayMeals.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No meals logged today</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayMeals.map((meal) => {
              const time = new Date(meal.created_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
              const names = meal.items_json?.map((i) => i.name).join(', ') ?? 'Meal'
              const expanded = expandedIds.has(meal.id)
              const isDeleting = deletingId === meal.id

              return (
                <Card
                  key={meal.id}
                  pad="14px 16px"
                  onClick={() => toggleExpand(meal.id)}
                  style={{ cursor: 'pointer', position: 'relative', opacity: isDeleting ? 0.5 : 1, transition: 'opacity 0.2s' }}
                >
                  {/* Delete button */}
                  <button
                    aria-label="Delete meal"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(meal.id)
                    }}
                    disabled={isDeleting}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--surface-2)',
                      border: 'none',
                      color: 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                      zIndex: 2,
                    }}
                  >
                    <IconClose size={13} />
                  </button>

                  {/* Meal summary row */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      paddingRight: 32,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 14,
                          color: 'var(--text)',
                          fontWeight: 500,
                          marginBottom: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {names}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                          { label: `${Math.round(meal.total_calories)} kcal`, primary: true },
                          { label: `P ${Math.round(meal.macros_json?.protein ?? 0)}g` },
                          { label: `C ${Math.round(meal.macros_json?.carbs ?? 0)}g` },
                          { label: `F ${Math.round(meal.macros_json?.fat ?? 0)}g` },
                        ].map(({ label, primary }) => (
                          <span
                            key={label}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: '0.10em',
                              textTransform: 'uppercase',
                              color: primary ? 'var(--accent)' : 'var(--text-dim)',
                              fontFamily: 'var(--sans)',
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--mono)',
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      {time}
                    </span>
                  </div>

                  {/* Expanded items list */}
                  {expanded && meal.items_json && meal.items_json.length > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {meal.items_json.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              fontSize: 13,
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.name}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--accent)',
                              fontFamily: 'var(--mono)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {item.calories} kcal
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={() => go('capture')}
        style={{
          width: '100%',
          height: 52,
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          border: 'none',
          borderRadius: 14,
          fontFamily: 'var(--sans)',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <IconCamera size={18} /> {todayMeals.length === 0 ? 'Snap Your First Meal' : 'Snap Your Next Meal'}
      </button>
    </div>
  )
}
