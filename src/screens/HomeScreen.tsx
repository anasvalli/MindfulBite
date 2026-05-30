import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import type { Meal, MealMood } from '../types'
import { Ring, Card, Eyebrow, MacroBar, CountUp, Skeleton, SkeletonCard } from '../components/ui'
import { IconFlame, IconMoon, IconMood, IconChevR, IconTrend } from '../components/icons'
import { parseTime12h } from '../lib/time'
import { computeStreak } from '../lib/streaks'
import { StreakBadge } from '../components/StreakBadge'
import { WeeklyRecap } from '../components/WeeklyRecap'

interface HomeScreenProps {
  go: (screen: string) => void
}

function greetingKey(): string {
  const h = new Date().getHours()
  if (h < 12) return 'home.greeting.morning'
  if (h < 17) return 'home.greeting.afternoon'
  return 'home.greeting.evening'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

interface PlanMeal {
  type: string
  name: string
  calories: number
  emoji: string
  time: string
}

function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  const sec = s % 60
  return `${m}m ${sec}s`
}

export function HomeScreen({ go }: HomeScreenProps) {
  const { profile, user } = useAuth()
  const { t } = useLanguage()
  const [meals, setMeals] = useState<Meal[]>([])
  const [lastMood, setLastMood] = useState<MealMood | null>(null)
  const [loading, setLoading] = useState(true)
  const [animProgress, setAnimProgress] = useState(0)
  const [nextMeal, setNextMeal] = useState<{ meal: PlanMeal; secondsLeft: number } | null>(null)
  const [streak, setStreak] = useState(0)
  const [showRecap, setShowRecap] = useState(false)

  const goal = profile?.daily_calorie_goal ?? 2150
  const eaten = meals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const left = Math.max(0, goal - eaten)
  const progress = goal > 0 ? eaten / goal : 0

  const totalProtein = meals.reduce((s, m) => s + (m.macros_json?.protein ?? 0), 0)
  const totalCarbs = meals.reduce((s, m) => s + (m.macros_json?.carbs ?? 0), 0)
  const totalFat = meals.reduce((s, m) => s + (m.macros_json?.fat ?? 0), 0)

  const firstName = profile?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'

  useEffect(() => {
    if (!user) return
    const uid = user.id

    async function load() {
      try {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)

        const [mealsRes, moodsRes] = await Promise.allSettled([
          supabase
            .from('meals')
            .select('*')
            .eq('user_id', uid)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: false }),
          supabase
            .from('mood_checkins')
            .select('*')
            .eq('user_id', uid)
            .gte('logged_at', startOfDay.toISOString())
            .order('logged_at', { ascending: false })
            .limit(1),
        ])

        if (mealsRes.status === 'fulfilled' && mealsRes.value.data) setMeals(mealsRes.value.data as Meal[])
        computeStreak(uid).then((s) => setStreak(s.current)).catch(() => {})
        if (moodsRes.status === 'fulfilled' && moodsRes.value.data && moodsRes.value.data.length > 0) {
          // mood_checkins uses logged_at and mood field — map to MealMood shape for display
          const row = moodsRes.value.data[0] as { mood: string; logged_at: string }
          setLastMood({ mood: row.mood, created_at: row.logged_at } as MealMood)
        }
      } catch (err) {
        console.warn('HomeScreen load error:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  // Animate ring on mount
  useEffect(() => {
    const t = setTimeout(() => setAnimProgress(progress), 100)
    return () => clearTimeout(t)
  }, [progress])

  // Countdown to the next upcoming meal in the saved meal plan
  useEffect(() => {
    const raw = localStorage.getItem('mealPlan')
    if (!raw) return
    let plan: PlanMeal[]
    try {
      plan = JSON.parse(raw)
    } catch {
      return
    }

    const tick = () => {
      const now = new Date()
      const upcoming = plan
        .map((m) => ({ meal: m, time: parseTime12h(m.time) }))
        .filter((x) => x.time && x.time.getTime() > now.getTime())
        .sort((a, b) => a.time!.getTime() - b.time!.getTime())[0]
      if (upcoming && upcoming.time) {
        setNextMeal({
          meal: upcoming.meal,
          secondsLeft: Math.floor((upcoming.time.getTime() - now.getTime()) / 1000),
        })
      } else {
        setNextMeal(null)
      }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  if (loading) {
    return (
      <div className="mb-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
        <Skeleton width="55%" height={28} />
        <SkeletonCard />
        <div style={{ display: 'flex', gap: 10 }}>
          <SkeletonCard style={{ flex: 1 }} />
          <SkeletonCard style={{ flex: 1 }} />
        </div>
        <SkeletonCard />
      </div>
    )
  }

  const recentMeals = meals.slice(0, 3)
  const moodEmoji: Record<string, string> = {
    Radiant: '☀️', Calm: '🍃', Tired: '🌙', Tense: '🌀', Low: '🌧️',
  }

  return (
    <div
      className="mb-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 8,
      }}
    >
      {/* Greeting */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 2 }}>{todayLabel()}</p>
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}
          >
            {t(greetingKey())}, {firstName}
          </h1>
        </div>
        <div onClick={() => setShowRecap(true)} style={{ cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
          <StreakBadge current={streak} />
        </div>
      </div>

      {showRecap && user && <WeeklyRecap userId={user.id} onClose={() => setShowRecap(false)} />}

      {/* Next Meal countdown */}
      {nextMeal && (
        <Card onClick={() => go('plans')} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>
            {nextMeal.meal.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--sans)' }}>
              Next: {nextMeal.meal.type}
            </div>
            <div style={{ fontSize: 14.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {nextMeal.meal.name}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {formatCountdown(nextMeal.secondsLeft)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>until {nextMeal.meal.time}</div>
          </div>
        </Card>
      )}

      {/* Main Ring Card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Ring
            size={130}
            stroke={10}
            progress={animProgress}
            color="var(--accent)"
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 30,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--text)',
                  lineHeight: 1,
                }}
              >
                <CountUp value={Math.round(eaten)} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                kcal eaten
              </div>
            </div>
          </Ring>

          <div style={{ flex: 1 }}>
            <Eyebrow style={{ marginBottom: 12 }}>{t('home.todaysIntake')}</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: t('home.goal'), val: `${Math.round(goal)} kcal`, color: 'var(--text-muted)' },
                { label: t('home.remaining'), val: `${Math.round(left)} kcal`, color: 'var(--accent)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <MacroBar
                  label="Protein"
                  value={Math.round(totalProtein)}
                  goal={profile?.protein_goal ?? 140}
                  color="oklch(0.75 0.12 180)"
                  unit="g"
                />
                <MacroBar
                  label="Carbs"
                  value={Math.round(totalCarbs)}
                  goal={profile?.carbs_goal ?? 210}
                  color="oklch(0.72 0.14 85)"
                  unit="g"
                />
                <MacroBar
                  label="Fat"
                  value={Math.round(totalFat)}
                  goal={profile?.fat_goal ?? 70}
                  color="oklch(0.70 0.12 55)"
                  unit="g"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stat Chips */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => go('sleep')}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '12px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
          }}
        >
          <IconMoon size={18} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>SLEEP</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--serif)', color: 'var(--text-muted)' }}>—</div>
          </div>
        </button>

        <button
          onClick={() => go('mood')}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '12px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
          }}
        >
          <IconMood size={18} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>MOOD</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--serif)', color: 'var(--text)' }}>
              {lastMood ? `${moodEmoji[lastMood.mood] ?? ''} ${lastMood.mood}` : '—'}
            </div>
          </div>
        </button>
      </div>

      {/* Coach Nudge */}
      <button
        onClick={() => go('coach')}
        style={{
          background: 'var(--accent-wash)',
          border: '1px solid var(--accent-line)',
          borderRadius: 18,
          padding: '14px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            🌿
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 2 }}>
              SAGE · AI COACH
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
              How are you feeling today?
            </div>
          </div>
        </div>
        <IconChevR size={18} />
      </button>

      {/* Meal Plan button */}
      <button
        onClick={() => go('plans')}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: '14px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Today's Meal Plan</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>AI-generated for your goals</div>
          </div>
        </div>
        <span style={{ color: 'var(--text-dim)' }}><IconChevR size={16} /></span>
      </button>

      {/* Insights link */}
      <button
        onClick={() => go('insights')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'var(--sans)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 0',
        }}
      >
        View your weekly insights <IconTrend size={14} />
      </button>

      {/* Quick track row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { key: 'water', emoji: '💧', label: 'Water' },
          { key: 'weight', emoji: '⚖️', label: 'Weight' },
          { key: 'cycle', emoji: '🌙', label: 'Cycle' },
        ].map((q) => (
          <button
            key={q.key}
            onClick={() => go(q.key)}
            className="mb-press"
            style={{
              flex: 1,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '12px 0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 18 }}>{q.emoji}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--sans)', fontWeight: 600 }}>{q.label}</span>
          </button>
        ))}
      </div>

      {/* Recent Meals */}
      {recentMeals.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Eyebrow>Recent Meals</Eyebrow>
            <button
              onClick={() => go('history')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)', fontWeight: 600 }}
            >
              See all
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentMeals.map((meal) => {
              const time = new Date(meal.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              const names = meal.items_json?.map((i) => i.name).join(', ') ?? 'Meal'
              return (
                <Card key={meal.id} pad="12px 16px">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <IconFlame size={14} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.10em',
                            textTransform: 'uppercase',
                            color: 'var(--accent)',
                            fontFamily: 'var(--sans)',
                          }}
                        >
                          {Math.round(meal.total_calories)} kcal
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {names}
                      </p>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 12 }}>
                      {time}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {recentMeals.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
            No meals logged today yet
          </p>
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
        </Card>
      )}
    </div>
  )
}
