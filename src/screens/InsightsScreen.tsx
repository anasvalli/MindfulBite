import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Ring, Card, Eyebrow, MacroBar, Spinner } from '../components/ui'
import { IconChevL, IconTrend } from '../components/icons'
import { MOOD_HUES, MOOD_EMOJIS } from '../lib/moods'

interface InsightsScreenProps {
  go: (screen: string) => void
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData {
  date: string
  label: string
  calories: number
  protein: number
  carbs: number
  fat: number
  mood: string | null
  moodHue: number | null
  moodIntensity: number | null
  sleepMinutes: number | null
  sleepQuality: number | null
}

interface ClinicalReport {
  food_score: number | null
  mood_score: number | null
  sleep_score: number | null
  overall_score: number | null
  recommendations: string | null
  summary: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']


const COLOR_MOOD = 'oklch(0.78 0.08 150)'
const COLOR_SLEEP = 'oklch(0.74 0.08 265)'
const COLOR_PROTEIN = 'oklch(0.75 0.12 180)'
const COLOR_SLEEP_WARN = 'oklch(0.76 0.09 30)'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateKey(row: Record<string, unknown>): string {
  const raw = (row['created_at'] ?? row['logged_at'] ?? row['date']) as string | undefined
  if (!raw) return ''
  return new Date(raw).toISOString().split('T')[0] ?? ''
}

function buildLast7(): DayData[] {
  const days: DayData[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const date = d.toISOString().split('T')[0] ?? ''
    days.push({
      date,
      label: DAY_LETTERS[d.getDay()] ?? '?',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mood: null,
      moodHue: null,
      moodIntensity: null,
      sleepMinutes: null,
      sleepQuality: null,
    })
  }
  return days
}

// ─── InsightsScreen ───────────────────────────────────────────────────────────

export function InsightsScreen({ go }: InsightsScreenProps) {
  const { user, profile } = useAuth()

  const [days, setDays] = useState<DayData[]>(buildLast7())
  const [report, setReport] = useState<ClinicalReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [animScores, setAnimScores] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const goal = profile?.daily_calorie_goal ?? 2150
  const proteinGoal = (goal * 0.25) / 4
  const carbsGoal = (goal * 0.45) / 4
  const fatGoal = (goal * 0.30) / 9

  const todayStr = new Date().toISOString().split('T')[0] ?? ''

  // ── Data Fetching ──
  useEffect(() => {
    if (!user) return

    async function load() {
      try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)
        const since = sevenDaysAgo.toISOString()

        const [mealsRes, moodRes, sleepRes, reportRes] = await Promise.allSettled([
          supabase
            .from('meals')
            .select('total_calories, macros_json, created_at')
            .eq('user_id', user!.id)
            .gte('created_at', since),

          supabase
            .from('mood_checkins')
            .select('mood, intensity, logged_at')
            .eq('user_id', user!.id)
            .gte('logged_at', since)
            .order('logged_at', { ascending: true }),

          supabase
            .from('sleep_logs')
            .select('duration_minutes, quality_score, date')
            .eq('user_id', user!.id)
            .gte('date', sevenDaysAgo.toISOString().split('T')[0] ?? ''),

          supabase
            .from('clinical_reports')
            .select('food_score, mood_score, sleep_score, overall_score, recommendations, summary')
            .eq('user_id', user!.id)
            .order('week_start', { ascending: false })
            .limit(1),
        ])

        const base = buildLast7()
        const dayMap = new Map(base.map((d) => [d.date, d]))

        // Meals — sum calories and protein per day
        if (mealsRes.status === 'fulfilled' && mealsRes.value.data) {
          for (const row of mealsRes.value.data as Array<{
            total_calories: number
            macros_json: { protein: number; carbs?: number; fat?: number } | null
            created_at: string
          }>) {
            const key = getDateKey(row as unknown as Record<string, unknown>)
            const day = dayMap.get(key)
            if (day) {
              day.calories += row.total_calories ?? 0
              day.protein += row.macros_json?.protein ?? 0
              day.carbs += row.macros_json?.carbs ?? 0
              day.fat += row.macros_json?.fat ?? 0
            }
          }
        }

        // Mood checkins — use last of day
        if (moodRes.status === 'fulfilled' && moodRes.value.data) {
          for (const row of moodRes.value.data as Array<{
            mood: string
            intensity: number | null
            logged_at: string
          }>) {
            const key = getDateKey(row as unknown as Record<string, unknown>)
            const day = dayMap.get(key)
            if (day) {
              day.mood = row.mood
              day.moodHue = MOOD_HUES[row.mood] ?? null
              day.moodIntensity = row.intensity ?? null
            }
          }
        }

        // Sleep logs
        if (sleepRes.status === 'fulfilled' && sleepRes.value.data) {
          for (const row of sleepRes.value.data as Array<{
            duration_minutes: number | null
            quality_score: number | null
            date: string
          }>) {
            const key = getDateKey(row as unknown as Record<string, unknown>)
            const day = dayMap.get(key)
            if (day) {
              day.sleepMinutes = row.duration_minutes ?? null
              day.sleepQuality = row.quality_score ?? null
            }
          }
        }

        // Clinical report
        if (reportRes.status === 'fulfilled' && reportRes.value.data && reportRes.value.data.length > 0) {
          setReport(reportRes.value.data[0] as ClinicalReport)
        }

        setDays([...dayMap.values()])
      } catch (err) {
        console.warn('InsightsScreen load error:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  async function generateReport() {
    if (!user || generating) return
    setGenerating(true)
    setGenerateError(null)

    try {
      // Build payload from current days data
      const mealsPayload = days
        .filter((d) => d.calories > 0)
        .map((d) => ({ date: d.date, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat }))

      const moodsPayload = days
        .filter((d) => d.mood !== null)
        .map((d) => ({ date: d.date, mood: d.mood!, intensity: d.moodIntensity ?? 3 }))

      const sleepPayload = days
        .filter((d) => d.sleepMinutes !== null)
        .map((d) => ({ date: d.date, durationMinutes: d.sleepMinutes!, quality: d.sleepQuality ?? 3 }))

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meals: mealsPayload,
          moods: moodsPayload,
          sleep: sleepPayload,
          profile: {
            full_name: profile?.full_name,
            daily_calorie_goal: profile?.daily_calorie_goal ?? 2150,
            weight: profile?.weight,
            goal_weight: profile?.goal_weight,
            dietary_prefs: profile?.dietary_prefs,
          },
        }),
      })

      if (!res.ok) throw new Error(`Report generation failed (${res.status})`)

      const newReport = await res.json() as {
        food_score: number
        mood_score: number
        sleep_score: number
        overall_score: number
        summary: string
        recommendations: Array<{ title: string; body: string; priority: string }>
      }

      // Save to Supabase
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const weekStartStr = weekStart.toISOString().split('T')[0]

      await supabase.from('clinical_reports').upsert({
        user_id: user.id,
        week_start: weekStartStr,
        food_score: newReport.food_score,
        mood_score: newReport.mood_score,
        sleep_score: newReport.sleep_score,
        overall_score: newReport.overall_score,
        recommendations: newReport.recommendations,
        summary: newReport.summary,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start' })

      setReport({
        food_score: newReport.food_score,
        mood_score: newReport.mood_score,
        sleep_score: newReport.sleep_score,
        overall_score: newReport.overall_score,
        recommendations: JSON.stringify(newReport.recommendations),
        summary: newReport.summary,
      })
      setAnimScores(false)
      setTimeout(() => setAnimScores(true), 100)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  // Animate score rings after load
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setAnimScores(true), 120)
      return () => clearTimeout(t)
    }
  }, [loading])

  // ── Derived values ──
  const avgCalories = days.length > 0
    ? Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length)
    : 0

  const avgProtein = days.length > 0
    ? days.reduce((s, d) => s + d.protein, 0) / days.length
    : 0
  const avgCarbs = days.length > 0 ? days.reduce((s, d) => s + d.carbs, 0) / days.length : 0
  const avgFat = days.length > 0 ? days.reduce((s, d) => s + d.fat, 0) / days.length : 0

  const maxCalBar = Math.max(...days.map((d) => d.calories), 100)

  // Sleep insight
  const sleepDays = days.filter((d) => d.sleepMinutes !== null)
  const avgSleep = sleepDays.length > 0
    ? sleepDays.reduce((s, d) => s + (d.sleepMinutes ?? 0), 0) / sleepDays.length
    : null

  const sleepInsight = avgSleep === null
    ? 'Log sleep to see patterns and insights here.'
    : avgSleep < 420
      ? 'Aim for 7+ hours — it directly affects mood and food choices.'
      : 'Good sleep consistency. Notice how it affects your energy levels.'

  // Mood × Calories correlation insight
  const goodMoodDays = days.filter((d) => d.mood === 'Radiant' || d.mood === 'Calm')
  const badMoodDays = days.filter((d) => d.mood === 'Tired' || d.mood === 'Low')
  const goodMoodAvg = goodMoodDays.length > 0
    ? goodMoodDays.reduce((s, d) => s + d.calories, 0) / goodMoodDays.length
    : null
  const badMoodAvg = badMoodDays.length > 0
    ? badMoodDays.reduce((s, d) => s + d.calories, 0) / badMoodDays.length
    : null

  let moodFoodInsight = 'No clear pattern yet — keep logging for insights.'
  if (goodMoodAvg !== null && badMoodAvg !== null) {
    if (goodMoodAvg > badMoodAvg + 200) {
      moodFoodInsight = 'You tend to eat more on good mood days.'
    } else if (badMoodAvg > goodMoodAvg + 200) {
      moodFoodInsight = 'Low mood days show higher calorie intake — emotional eating pattern?'
    }
  }

  // ── Score chip ──
  function ScoreChip({
    label,
    score,
    color,
  }: {
    label: string
    score: number | null
    color: string
  }) {
    const val = score ?? 0
    return (
      <div
        style={{
          flex: 1,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: '14px 8px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ring size={60} stroke={5} progress={animScores ? val / 10 : 0} color={color}>
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            {val.toFixed(0)}
          </span>
        </Ring>
        <Eyebrow>{label}</Eyebrow>
      </div>
    )
  }

  // ── Render ──
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div
      className="mb-screen"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          Insights
        </h2>
        <div style={{ color: 'var(--text-dim)', padding: 4 }}>
          <IconTrend size={18} />
        </div>
      </div>

      {/* ── Section 1: Weekly Scores ── */}
      {report ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>Weekly Scores</Eyebrow>
            <button
              onClick={generateReport}
              disabled={generating}
              style={{
                background: 'none', border: 'none', color: 'var(--text-dim)',
                fontSize: 11, cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--sans)', padding: 0,
              }}
            >
              {generating ? '…' : '↻ Regenerate'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ScoreChip label="FOOD" score={report.food_score} color="var(--accent)" />
            <ScoreChip label="MOOD" score={report.mood_score} color={COLOR_MOOD} />
            <ScoreChip label="SLEEP" score={report.sleep_score} color={COLOR_SLEEP} />
          </div>
          {report.summary && (
            <div style={{
              background: 'var(--accent-wash)', border: '1px solid var(--accent-line)',
              borderRadius: 14, padding: '12px 16px', fontSize: 13,
              color: 'var(--text-muted)', lineHeight: 1.55,
            }}>
              {report.summary}
            </div>
          )}
          {/* Recommendations */}
          {report.recommendations && (() => {
            try {
              const recs = typeof report.recommendations === 'string'
                ? JSON.parse(report.recommendations)
                : report.recommendations
              if (!Array.isArray(recs)) return null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Eyebrow style={{ display: 'block', marginTop: 4 }}>Sage Recommends</Eyebrow>
                  {recs.map((r: { title: string; body: string; priority: string }, i: number) => (
                    <div key={i} style={{
                      background: 'var(--surface)', border: '1px solid var(--line)',
                      borderRadius: 16, padding: '14px 16px',
                      borderLeft: `3px solid ${r.priority === 'high' ? 'var(--accent)' : r.priority === 'medium' ? COLOR_MOOD : 'var(--surface-2)'}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {r.body}
                      </div>
                    </div>
                  ))}
                </div>
              )
            } catch { return null }
          })()}
        </div>
      ) : (
        <Card style={{ textAlign: 'center', padding: '22px 20px' }}>
          <p style={{ fontSize: 28, marginBottom: 10 }}>🔍</p>
          <p style={{ fontSize: 14, fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: 6 }}>
            Your Weekly Report
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
            Sage will analyse your food, mood, and sleep data to generate personalised clinical scores and recommendations.
          </p>
          {generateError && (
            <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{generateError}</p>
          )}
          <button
            onClick={generateReport}
            disabled={generating}
            style={{
              background: generating ? 'var(--accent-wash)' : 'var(--accent)',
              color: generating ? 'var(--text-dim)' : 'var(--on-accent)',
              border: 'none', borderRadius: 14, padding: '12px 28px',
              fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto',
            }}
          >
            {generating ? (
              <>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid var(--text-dim)', borderTopColor: 'var(--accent)',
                  animation: 'mb-spin 0.8s linear infinite',
                }} />
                Analysing with Claude…
              </>
            ) : '✦ Generate Report'}
          </button>
        </Card>
      )}

      {/* ── Section 2: Calorie Trend ── */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <Eyebrow>Calories This Week</Eyebrow>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--accent)',
            }}
          >
            avg {avgCalories} kcal
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            height: 80,
            gap: 6,
          }}
        >
          {days.map((day) => {
            const isToday = day.date === todayStr
            const barH = Math.max(3, (day.calories / Math.max(maxCalBar, 3000)) * 80)
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'flex-end',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: barH,
                    background: isToday ? 'var(--accent)' : 'var(--surface-2)',
                    borderRadius: 4,
                    transition: 'height 0.5s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    color: isToday ? 'var(--accent)' : 'var(--text-dim)',
                  }}
                >
                  {day.label}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Section 3: Mood × Calories ── */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 4 }}>Mood × Food</Eyebrow>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            marginBottom: 14,
            lineHeight: 1.4,
          }}
        >
          How your calorie intake tracks with your mood
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 14 }}>
          {days.map((day) => {
            const isToday = day.date === todayStr
            const barH = Math.max(2, (day.calories / Math.max(maxCalBar, 3000)) * 40)
            const emoji = day.mood ? (MOOD_EMOJIS[day.mood] ?? '—') : '—'
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
                <div
                  style={{
                    width: '100%',
                    height: barH,
                    background: isToday ? 'var(--accent)' : 'var(--surface-2)',
                    borderRadius: 3,
                    transition: 'height 0.5s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    color: isToday ? 'var(--accent)' : 'var(--text-dim)',
                  }}
                >
                  {day.label}
                </span>
              </div>
            )
          })}
        </div>
        <div
          style={{
            background: 'var(--accent-wash)',
            border: '1px solid var(--accent-line)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          {moodFoodInsight}
        </div>
      </Card>

      {/* ── Section 4: Sleep × Mood ── */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>Sleep × Mood</Eyebrow>
        {/* Sleep bars */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60, marginBottom: 10 }}>
          {days.map((day) => {
            const mins = day.sleepMinutes
            const quality = day.sleepQuality
            const barH = mins !== null ? Math.max(3, (mins / 600) * 60) : 3
            let barColor: string
            if (mins === null) {
              barColor = 'var(--surface-2)'
            } else if (quality === null) {
              barColor = 'var(--surface-2)'
            } else if (quality >= 4) {
              barColor = COLOR_SLEEP
            } else if (quality === 3) {
              barColor = 'var(--text-muted)'
            } else {
              barColor = COLOR_SLEEP_WARN
            }

            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: 'flex-end',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: barH,
                    background: barColor,
                    borderRadius: 3,
                    transition: 'height 0.5s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </div>
            )
          })}
        </div>
        {/* Mood emoji row below sleep bars */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {days.map((day) => {
            const emoji = day.mood ? (MOOD_EMOJIS[day.mood] ?? '·') : '·'
            const hue = day.moodHue
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: hue !== null ? `oklch(0.72 0.10 ${hue} / 0.15)` : 'var(--surface-2)',
                    border: `1px solid ${hue !== null ? `oklch(0.72 0.10 ${hue} / 0.35)` : 'var(--line)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                  }}
                >
                  {emoji}
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    color: 'var(--text-dim)',
                  }}
                >
                  {day.label}
                </span>
              </div>
            )
          })}
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {sleepInsight}
        </p>
      </Card>

      {/* ── Section 5: Weekly Macros ── */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 16 }}>Weekly Macros</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <MacroBar
            label="Protein"
            value={avgProtein}
            goal={proteinGoal}
            color={COLOR_PROTEIN}
          />
          <MacroBar
            label="Carbs"
            value={avgCarbs}
            goal={carbsGoal}
            color="oklch(0.72 0.14 85)"
          />
          <MacroBar
            label="Fat"
            value={avgFat}
            goal={fatGoal}
            color="oklch(0.70 0.12 55)"
          />
        </div>
        <p
          style={{
            marginTop: 14,
            fontSize: 11,
            color: 'var(--text-dim)',
            lineHeight: 1.4,
            fontFamily: 'var(--sans)',
          }}
        >
          Daily averages over the past 7 days vs. your personal targets.
        </p>
      </Card>
    </div>
  )
}
