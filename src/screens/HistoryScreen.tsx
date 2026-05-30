import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Meal } from '../types'
import { Card, Eyebrow, Spinner } from '../components/ui'
import { IconChevL, IconBook, IconFlame, IconClose } from '../components/icons'

interface HistoryScreenProps {
  go: (screen: string) => void
}

const PAGE_SIZE = 30

function dateLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dDay = new Date(d)
  dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return 'Today'
  if (dDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

interface DateGroup {
  label: string
  meals: Meal[]
  totalCalories: number
}

function groupByDate(meals: Meal[]): DateGroup[] {
  const groups: DateGroup[] = []
  const index: Record<string, DateGroup> = {}
  for (const meal of meals) {
    const label = dateLabel(meal.created_at)
    let group = index[label]
    if (!group) {
      group = { label, meals: [], totalCalories: 0 }
      index[label] = group
      groups.push(group)
    }
    group.meals.push(meal)
    group.totalCalories += meal.total_calories ?? 0
  }
  return groups
}

export function HistoryScreen({ go }: HistoryScreenProps) {
  const { user } = useAuth()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)

  async function fetchPage(p: number) {
    if (!user) return
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) {
      console.warn('History fetch error:', error.message)
      setHasMore(false)
      return
    }

    const rows = (data ?? []) as Meal[]
    setMeals((prev) => (p === 0 ? rows : [...prev, ...rows]))
    setHasMore(rows.length === PAGE_SIZE)
    setPage(p)
  }

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchPage(0).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      await fetchPage(page + 1)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleDelete(mealId: string) {
    const prev = meals
    setMeals((m) => m.filter((meal) => meal.id !== mealId))
    const { error } = await supabase.from('meals').delete().eq('id', mealId)
    if (error) {
      console.warn('Delete meal failed:', error.message)
      setMeals(prev)
    }
  }

  const groups = groupByDate(meals)

  return (
    <div
      className="mb-screen"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '56px 20px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => go('home')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
        >
          <IconChevL size={20} />
        </button>
        <h2
          style={{
            flex: 1,
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}
        >
          History
        </h2>
        <span style={{ color: 'var(--text-dim)' }}>
          <IconBook size={20} />
        </span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : meals.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '40px 20px',
          }}
        >
          <div style={{ fontSize: 32 }}>🍽️</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No meals logged yet</p>
          <button
            onClick={() => go('capture')}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 14,
              padding: '10px 24px',
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Snap Your First Meal
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 20px 60px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groups.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 5,
                  background: 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 2px 10px',
                }}
              >
                <Eyebrow>{group.label}</Eyebrow>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent)',
                  }}
                >
                  {Math.round(group.totalCalories)} kcal
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.meals.map((meal) => {
                  const time = new Date(meal.created_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                  const names = meal.items_json?.map((i) => i.name).join(', ') ?? 'Meal'
                  const macros = `P ${Math.round(meal.macros_json?.protein ?? 0)}g · C ${Math.round(
                    meal.macros_json?.carbs ?? 0
                  )}g · F ${Math.round(meal.macros_json?.fat ?? 0)}g`
                  return (
                    <Card key={meal.id} pad="12px 14px">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Emoji/icon tile */}
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            background: 'var(--accent-wash)',
                            border: '1px solid var(--accent-line)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent)',
                            flexShrink: 0,
                            fontSize: 20,
                          }}
                        >
                          {meal.image_url ? '🍽️' : <IconFlame size={20} />}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: 'var(--text)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginBottom: 3,
                            }}
                          >
                            {names}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--accent)',
                                fontFamily: 'var(--sans)',
                              }}
                            >
                              {Math.round(meal.total_calories)} kcal
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                              {time}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 3 }}>
                            {macros}
                          </p>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDelete(meal.id)}
                          aria-label="Delete meal"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line)',
                            borderRadius: 10,
                            width: 30,
                            height: 30,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <IconClose size={14} />
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: '14px 20px',
                color: loadingMore ? 'var(--text-dim)' : 'var(--text-muted)',
                fontFamily: 'var(--sans)',
                fontSize: 14,
                fontWeight: 600,
                cursor: loadingMore ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingMore ? 'Loading…' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
