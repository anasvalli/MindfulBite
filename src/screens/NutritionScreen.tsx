import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Meal } from '../types'
import { Ring, Card, Eyebrow, Bars, MacroBar, Spinner } from '../components/ui'
import { IconChevL, IconClose } from '../components/icons'

interface NutritionScreenProps {
  go: (screen: string) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function NutritionScreen({ go }: NutritionScreenProps) {
  const { user, profile } = useAuth()
  const [todayMeals, setTodayMeals] = useState<Meal[]>([])
  const [weeklyData, setWeeklyData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [weekDayLabels, setWeekDayLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const goal = profile?.daily_calorie_goal ?? 2150
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

        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)

        const [todayRes, weekRes] = await Promise.all([
          supabase
            .from('meals')
            .select('*')
            .eq('user_id', uid)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: false }),
          supabase
            .from('meals')
            .select('total_calories, created_at')
            .eq('user_id', uid)
            .gte('created_at', sevenDaysAgo.toISOString()),
        ])

        if (todayRes.data) setTodayMeals(todayRes.data as Meal[])

        // Build 7-day aggregation
        const buckets: number[] = [0, 0, 0, 0, 0, 0, 0]
        const labels: string[] = []
        const today = new Date()

        for (let i = 6; i >= 0; i--) {
          const d = new Date(today)
          d.setDate(d.getDate() - i)
          labels.push(DAYS[d.getDay()] ?? '')
        }
        setWeekDayLabels(labels)

        if (weekRes.data) {
          const todayEnd = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime() })()
          for (const row of weekRes.data) {
            const rowDate = new Date(row.created_at as string)
            const diffMs = todayEnd - rowDate.getTime()
            const diffDays = Math.floor(diffMs / 86400000)
            const idx = 6 - diffDays
            if (idx >= 0 && idx < 7) {
              buckets[idx] = (buckets[idx] ?? 0) + ((row.total_calories as number) ?? 0)
            }
          }
        }
        setWeeklyData(buckets)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => go('home')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
        >
          <IconChevL size={20} />
        </button>
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
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 76,
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
              borderRadius: 6,
              background: 'var(--surface-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(1, eaten / goal) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 6,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Macro Donuts */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>Macronutrients</Eyebrow>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
          {[
            { label: 'Protein', val: totalProtein, goal: (goal * 0.30) / 4, color: 'oklch(0.75 0.12 180)' },
            { label: 'Carbs', val: totalCarbs, goal: (goal * 0.45) / 4, color: 'oklch(0.72 0.14 85)' },
            { label: 'Fat', val: totalFat, goal: (goal * 0.25) / 9, color: 'oklch(0.70 0.12 55)' },
          ].map(({ label, val, goal: g, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Ring size={70} stroke={6} progress={g > 0 ? val / g : 0} color={color}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500, color }}>
                  {Math.round(val)}
                </span>
              </Ring>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
                {label.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MacroBar label="Protein" value={totalProtein} goal={(goal * 0.30) / 4} color="oklch(0.75 0.12 180)" />
          <MacroBar label="Carbs" value={totalCarbs} goal={(goal * 0.45) / 4} color="oklch(0.72 0.14 85)" />
          <MacroBar label="Fat" value={totalFat} goal={(goal * 0.25) / 9} color="oklch(0.70 0.12 55)" />
        </div>
      </Card>

      {/* Weekly Bar Chart */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>This Week</Eyebrow>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bars data={weeklyData} w={30} h={72} active={6} />
            <div style={{ display: 'flex', gap: 4 }}>
              {weekDayLabels.map((d, i) => (
                <div
                  key={i}
                  style={{
                    width: 30,
                    textAlign: 'center',
                    fontSize: 10,
                    color: i === 6 ? 'var(--accent)' : 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                    flexShrink: 0,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
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
          borderRadius: 18,
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
        📷 Snap Your Next Meal
      </button>
    </div>
  )
}
