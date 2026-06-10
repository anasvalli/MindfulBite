import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import type { Meal, MealMood } from '../types'
import { Ring, Card, Eyebrow, MacroBar, CountUp, Skeleton, SkeletonCard, toast, haptic } from '../components/ui'
import { IconFlame, IconMoon, IconMood, IconChevR, IconTrend, IconGear, IconCalendar, IconScale, IconDrop } from '../components/icons'
import { parseTime12h } from '../lib/time'
import { computeStreak, type StreakResult } from '../lib/streaks'
import { StreakBadge } from '../components/StreakBadge'
import { WeeklyRecap } from '../components/WeeklyRecap'
import { goalFor } from '../lib/goals'
import { isNotificationsEnabled, getReminderPrefs, scheduleAllReminders } from '../lib/notifications'
import { macroTargets } from '../lib/targets'
import { aggregateDays, type DayAgg } from '../lib/aggregate'
import { localDateKey } from '../lib/dates'
import { loadMealPlan, isMealPlanPending } from '../lib/mealPlan'

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

// ISO week key like "2026-W24" for once-per-week guards.
function isoWeekKey(): string {
  const d = new Date()
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${week}`
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

// ─── Streak detail sheet ──────────────────────────────────────────────────────
function StreakSheet({ streak, days, onClose }: { streak: StreakResult; days: DayAgg[]; onClose: () => void }) {
  const week = days.slice(-7)
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
          width: '100%',
          maxWidth: 360,
          borderRadius: 22,
          padding: 26,
          border: '1px solid var(--accent-line)',
          background: 'linear-gradient(165deg, var(--accent-wash) 0%, var(--surface) 45%, var(--surface-2) 100%)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>🔥</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
            {streak.current}
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            day{streak.current === 1 ? '' : 's'} in a row
          </div>
        </div>

        {/* This week dot calendar */}
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 10, textAlign: 'center' }}>This week</Eyebrow>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            {week.map((d) => (
              <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: d.mealCount > 0 ? 'var(--accent)' : 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: 'var(--on-accent)',
                  }}
                >
                  {d.mealCount > 0 ? '✓' : ''}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 14, padding: '12px 8px', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{streak.best}</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Best streak</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 14, padding: '12px 8px', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{streak.daysThisWeek}<span style={{ fontSize: 13, color: 'var(--text-dim)' }}>/7</span></div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Days this week</div>
          </div>
        </div>

        <p style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
          Log at least one meal a day to keep your streak alive.
        </p>

        <button
          className="mb-press"
          onClick={onClose}
          style={{
            padding: '13px 20px',
            borderRadius: 14,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontFamily: 'var(--sans)',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Keep it going
        </button>
      </div>
    </div>
  )
}

export function HomeScreen({ go }: HomeScreenProps) {
  const { profile, user } = useAuth()
  const { t } = useLanguage()
  const [meals, setMeals] = useState<Meal[]>([])
  const [lastMood, setLastMood] = useState<MealMood | null>(null)
  const [loading, setLoading] = useState(true)
  const [animProgress, setAnimProgress] = useState(0)
  const [nextMeal, setNextMeal] = useState<{ meal: PlanMeal; secondsLeft: number } | null>(null)
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0, daysThisWeek: 0 })
  const [showRecap, setShowRecap] = useState(false)
  const [showStreakSheet, setShowStreakSheet] = useState(false)
  const [insight, setInsight] = useState<{ insight: string; cta?: string } | null>(null)
  const [days, setDays] = useState<DayAgg[]>([])
  const [waterToday, setWaterToday] = useState(0)
  const [waterBusy, setWaterBusy] = useState(false)
  const planPending = user ? isMealPlanPending(user.id) : false

  // One source of truth for goals — same numbers as Nutrition/Insights/Settings.
  const targets = macroTargets(profile)
  const goal = targets.calories
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
        computeStreak(uid).then(setStreak).catch(() => {})
        // Shared per-day aggregation feeds the sleep chip, yesterday line,
        // water tile total, streak week-dots, and the goal momentum sentence.
        aggregateDays(uid, 7)
          .then((agg) => {
            setDays(agg)
            const today = agg[agg.length - 1]
            if (today) setWaterToday(today.waterMl)
          })
          .catch(() => {})
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

  // Proactive "Insight of the day" — one cheap call per user per day, cached.
  // The cache key carries a data-state bucket (_empty/_fed) so the insight
  // regenerates once when the first meal of the day lands — no more "snap your
  // first meal!" sitting above a ring full of calories.
  useEffect(() => {
    if (!user || loading) return
    const today = localDateKey(new Date())
    const bucket = meals.length > 0 ? 'fed' : 'empty'
    const cacheKey = `dailyInsight_${user.id}_${today}_${bucket}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const v = JSON.parse(cached)
        if (v?.insight) setInsight(v)
      } catch { /* ignore */ }
      return
    }
    async function fetchInsight() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/daily-insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({}),
        })
        if (!res.ok) return
        const data = await res.json() as { insight: string | null; cta?: string }
        if (data?.insight) {
          setInsight({ insight: data.insight, cta: data.cta })
          localStorage.setItem(cacheKey, JSON.stringify(data))
        }
      } catch { /* non-blocking */ }
    }
    fetchInsight()
  }, [user, loading, meals.length > 0])

  // Re-arm reminders each time the app opens (setTimeout-based, so they fire
  // while the session is open; true background push is a later enhancement).
  useEffect(() => {
    if (!isNotificationsEnabled()) return
    const prefs = getReminderPrefs()
    if (!prefs.meals && !prefs.water && !prefs.windDown) return
    const stored = user ? loadMealPlan(user.id) : null
    scheduleAllReminders({
      wakeTime: profile?.wake_time,
      sleepTime: profile?.sleep_time,
      mealPlan: stored?.items ?? null,
      prefs,
    })
  }, [profile?.wake_time, profile?.sleep_time])

  // Animate ring on mount
  useEffect(() => {
    const t = setTimeout(() => setAnimProgress(progress), 100)
    return () => clearTimeout(t)
  }, [progress])

  // Auto-present the weekly recap once at the start of each new week — but
  // only when there's actually a week of data to celebrate (never the
  // all-zeros version for brand-new users).
  useEffect(() => {
    if (!user || loading || days.length === 0) return
    const guard = `recapShown_${user.id}_${isoWeekKey()}`
    if (localStorage.getItem(guard)) return
    // Celebrating "your week" minutes after signup reads as fake — wait for a real week.
    const loggedDays = days.filter((d) => d.mealCount > 0).length
    if (loggedDays < 3) return
    localStorage.setItem(guard, '1')
    const t = setTimeout(() => setShowRecap(true), 1200)
    return () => clearTimeout(t)
  }, [user, loading, days])

  // Countdown to the next upcoming meal in the saved meal plan
  useEffect(() => {
    const stored = user ? loadMealPlan(user.id) : null
    if (!stored || stored.items.length === 0) return
    const plan: PlanMeal[] = stored.items

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 3 }}>{todayLabel()}</p>
          <h1
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: 'var(--text)',
            }}
          >
            {t(greetingKey())}, {firstName}
          </h1>
          {/* Yesterday close-out — part of the morning brief */}
          {(() => {
            const y = days.length >= 2 ? days[days.length - 2] : null
            if (!y || (y.calories === 0 && y.sleepMinutes == null)) return null
            const bits: string[] = []
            if (y.calories > 0) bits.push(`${Math.round(y.calories).toLocaleString()} kcal`)
            if (y.sleepMinutes != null) bits.push(`${Math.round((y.sleepMinutes / 60) * 10) / 10}h sleep`)
            return (
              <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4, fontFamily: 'var(--mono)' }}>
                Yesterday: {bits.join(' · ')}
              </p>
            )
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
          <button
            onClick={() => setShowStreakSheet(true)}
            aria-label="Streak details"
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            <StreakBadge current={streak.current} />
          </button>
          <button
            onClick={() => go('settings')}
            aria-label="Settings"
            className="mb-press"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <IconGear size={18} />
          </button>
        </div>
      </div>

      {showRecap && user && <WeeklyRecap userId={user.id} onClose={() => setShowRecap(false)} />}
      {showStreakSheet && <StreakSheet streak={streak} days={days} onClose={() => setShowStreakSheet(false)} />}

      {/* Onboarding hand-off: first meal plan being generated */}
      {planPending && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>
            🌿
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Sage is building your day…
            </div>
            <Skeleton width="80%" height={10} />
          </div>
        </Card>
      )}

      {/* Proactive Sage — Insight of the day (never show the "first meal" CTA
          variant once meals exist today) */}
      {insight && !(meals.length > 0 && /first meal/i.test(insight.insight)) && (
        <button
          onClick={() => go('coach')}
          className="mb-press"
          style={{
            background: 'var(--accent-wash)',
            border: '1px solid var(--accent-line)',
            borderRadius: 14,
            padding: '14px 16px',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
            🌿
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 4 }}>
              ✦ SAGE NOTICED
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{insight.insight}</div>
            {insight.cta && (
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 6 }}>
                {insight.cta} →
              </div>
            )}
          </div>
        </button>
      )}

      {/* Next Meal countdown */}
      {nextMeal && (
        <Card onClick={() => go('plans')} style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>
            {nextMeal.meal.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--sans)' }}>
              Next: {nextMeal.meal.type}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
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

      {/* Main Ring Card — tap to see the full nutrition breakdown */}
      <Card onClick={() => go('nutrition')}>
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
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color, whiteSpace: 'nowrap', textAlign: 'right' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <MacroBar
                  label="Protein"
                  value={Math.round(totalProtein)}
                  goal={targets.protein}
                  color="oklch(0.75 0.12 180)"
                  unit="g"
                />
                <MacroBar
                  label="Carbs"
                  value={Math.round(totalCarbs)}
                  goal={targets.carbs}
                  color="oklch(0.72 0.14 85)"
                  unit="g"
                />
                <MacroBar
                  label="Fat"
                  value={Math.round(totalFat)}
                  goal={targets.fat}
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
            borderRadius: 14,
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
            {(() => {
              // Last night = today's morning-of row, else yesterday's.
              const today = days[days.length - 1]
              const yest = days.length >= 2 ? days[days.length - 2] : null
              const mins = today?.sleepMinutes ?? yest?.sleepMinutes ?? null
              return mins != null ? (
                <div style={{ fontSize: 15, fontFamily: 'var(--serif)', color: 'var(--text)' }}>
                  {Math.round((mins / 60) * 10) / 10}h
                </div>
              ) : (
                <div style={{ fontSize: 12, fontFamily: 'var(--sans)', color: 'var(--text-dim)' }}>
                  Log last night →
                </div>
              )
            })()}
          </div>
        </button>

        <button
          onClick={() => go('mood')}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 14,
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
            <div style={{ fontSize: lastMood ? 15 : 12, fontFamily: lastMood ? 'var(--serif)' : 'var(--sans)', color: lastMood ? 'var(--text)' : 'var(--text-dim)' }}>
              {lastMood ? `${moodEmoji[lastMood.mood] ?? ''} ${lastMood.mood}` : 'Check in →'}
            </div>
          </div>
        </button>
      </div>

      {/* Coach Nudge — only when Sage's insight card isn't already showing
          (two gold Sage cards stacked on one screen read as clutter) */}
      {!insight && (
      <button
        onClick={() => go('coach')}
        style={{
          background: 'var(--accent-wash)',
          border: '1px solid var(--accent-line)',
          borderRadius: 14,
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
              borderRadius: 10,
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
      )}

      {/* Meal Plan button */}
      <button
        onClick={() => go('plans')}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '14px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-muted)', display: 'flex' }}><IconCalendar size={20} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Today's Meal Plan</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {(() => {
                // Truthful subtitle: show the actual plan, the pending state, or
                // an honest CTA — never claim a plan that doesn't exist yet.
                if (planPending) return 'Sage is building your day…'
                const stored = user ? loadMealPlan(user.id) : null
                if (stored && stored.items.length > 0) {
                  const first = stored.items[0]
                  return `${first.name} · ${first.time}${stored.items.length > 1 ? ` +${stored.items.length - 1} more` : ''}`
                }
                return 'Tap to generate from your goals'
              })()}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--text-dim)' }}><IconChevR size={16} /></span>
      </button>

      {/* Insights + recap links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
            padding: '8px 0',
            minHeight: 44,
          }}
        >
          View your weekly insights <IconTrend size={14} />
        </button>
        <button
          onClick={() => setShowRecap(true)}
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
            padding: '8px 0',
            minHeight: 44,
          }}
        >
          Your week in review ↗
        </button>
      </div>

      {/* Goal progress */}
      {(() => {
        const g = goalFor(profile?.primary_goal)
        if (!g) return null
        const w = profile?.weight ?? null
        const gw = profile?.goal_weight ?? null
        let progressPct: number | null = null
        let detail = g.blurb
        if (g.metric === 'weight' && w != null && gw != null && w !== gw) {
          // Progress isn't truly knowable without a start weight; show distance to goal.
          const remaining = Math.abs(w - gw)
          detail = remaining < 0.5 ? 'At your goal weight 🎯' : `${remaining.toFixed(1)} kg to your goal (${gw} kg)`
          progressPct = Math.max(0.05, Math.min(1, 1 - remaining / Math.max(w, gw)))
        } else if (g.metric === 'protein' && profile?.protein_goal) {
          detail = `Aim for ${Math.round(profile.protein_goal)}g protein daily`
        }
        // One momentum sentence from real data — the card should narrate
        // progress, not sit static forever.
        let momentum: string | null = null
        const logged = days.filter((d) => d.mealCount > 0)
        const weights = days.filter((d) => d.weightKg != null)
        if (logged.length >= 2) {
          const avgDelta = Math.round(logged.reduce((s, d) => s + (d.calories - goal), 0) / logged.length)
          momentum =
            avgDelta <= 0
              ? `Averaging ${Math.abs(avgDelta)} kcal under goal this week — on track.`
              : `Averaging ${avgDelta} kcal over goal this week.`
        } else if (weights.length >= 2) {
          const delta = Math.round(((weights[weights.length - 1].weightKg ?? 0) - (weights[0].weightKg ?? 0)) * 10) / 10
          if (delta !== 0) momentum = `${Math.abs(delta)} kg ${delta < 0 ? 'down' : 'up'} this week.`
        } else if (streak.current >= 2) {
          momentum = `${streak.current} days in a row — keep showing up.`
        }
        return (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>
                {g.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <Eyebrow>Your goal</Eyebrow>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>🔥 {streak.current}d</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{g.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{detail}</div>
                {momentum && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>{momentum}</div>
                )}
                {progressPct != null && (
                  <div style={{ height: 5, borderRadius: 4, background: 'var(--ring-track)', overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: '100%', width: `${progressPct * 100}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                  </div>
                )}
              </div>
            </div>
          </Card>
        )
      })()}

      {/* Quick track row — Water is a true one-tap logger; Cycle only shows
          when relevant to the user's gender (it read as "we ignored your
          answers" for male users), backfilled with a Mood quick-log. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={async () => {
            if (!user || waterBusy) return
            setWaterBusy(true)
            haptic()
            const prev = waterToday
            setWaterToday(prev + 250) // optimistic
            const { data, error } = await supabase
              .from('water_logs')
              .insert({ user_id: user.id, date: localDateKey(new Date()), amount_ml: 250 })
              .select()
              .single()
            if (error || !data) {
              setWaterToday(prev)
              toast("Couldn't save — you're offline", { type: 'error' })
            } else {
              const rowId = (data as { id: string }).id
              toast('250ml logged', {
                action: {
                  label: 'Undo',
                  onClick: async () => {
                    await supabase.from('water_logs').delete().eq('id', rowId)
                    setWaterToday((w) => Math.max(0, w - 250))
                  },
                },
              })
            }
            setWaterBusy(false)
          }}
          className="mb-press"
          aria-label="Log 250ml of water"
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
            position: 'relative',
            opacity: waterBusy ? 0.7 : 1,
          }}
        >
          <span
            role="link"
            aria-label="Open water tracking"
            onClick={(e) => {
              e.stopPropagation()
              go('water')
            }}
            style={{ position: 'absolute', top: 4, right: 6, color: 'var(--text-dim)', fontSize: 13, padding: '2px 4px' }}
          >
            ›
          </span>
          <span style={{ color: 'oklch(0.74 0.10 230)', display: 'flex' }}><IconDrop size={18} /></span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--sans)', fontWeight: 600 }}>
            {waterToday > 0 ? `${waterToday >= 1000 ? `${(waterToday / 1000).toFixed(1)}L` : `${waterToday}ml`}` : 'Water'}
            <span style={{ color: 'var(--accent)' }}> +</span>
          </span>
        </button>
        {[
          { key: 'weight', icon: <IconScale size={18} />, label: 'Weight' },
          ...(profile?.gender === 'Male'
            ? [{ key: 'mood', icon: <IconMood size={18} />, label: 'Mood' }]
            : [{ key: 'cycle', icon: <IconMoon size={18} />, label: 'Cycle' }]),
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
            <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{q.icon}</span>
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
