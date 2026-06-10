import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Ring, Card, Eyebrow, Spinner, IconButton, toast } from '../components/ui'
import { IconChevL, IconTrend, IconSearch } from '../components/icons'
import { MOOD_HUES, MOOD_EMOJIS } from '../lib/moods'
import { macroTargets } from '../lib/targets'
import { aggregateDays } from '../lib/aggregate'
import { localDateKey } from '../lib/dates'

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

interface HistoryPoint {
  week_start: string
  overall_score: number | null
  food_score: number | null
  mood_score: number | null
  sleep_score: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_MOOD = 'oklch(0.78 0.08 150)'
const COLOR_SLEEP = 'oklch(0.74 0.08 265)'
const COLOR_PROTEIN = 'oklch(0.75 0.12 180)'
const COLOR_SLEEP_WARN = 'oklch(0.76 0.09 30)'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function abbrevWeek(weekStart: string): string {
  // weekStart is a YYYY-MM-DD date; render as e.g. "May 26"
  const d = new Date(`${weekStart}T00:00:00`)
  if (isNaN(d.getTime())) return weekStart
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Empty 7-day scaffold (local-timezone keys, two-letter labels).
function buildLast7(): DayData[] {
  const days: DayData[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({
      date: localDateKey(d),
      label: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()] ?? '?',
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
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [animScores, setAnimScores] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Single source of truth — the same numbers Home, Nutrition, and Settings show.
  const targets = macroTargets(profile)
  const goal = targets.calories
  const proteinGoal = targets.protein
  const carbsGoal = targets.carbs
  const fatGoal = targets.fat

  const todayStr = localDateKey(new Date())

  // ── Data Fetching ──
  useEffect(() => {
    if (!user) return

    async function load() {
      try {
        // Day-level data comes from the ONE shared aggregation pipeline (local
        // timezone, sleep on its morning-of date) — the same numbers Home and
        // Nutrition show. The old inline version bucketed by UTC, which is why
        // these charts read zeros while the rest of the app showed data.
        const [agg, reportRes, historyRes] = await Promise.allSettled([
          aggregateDays(user!.id, 7),

          supabase
            .from('clinical_reports')
            .select('food_score, mood_score, sleep_score, overall_score, recommendations, summary')
            .eq('user_id', user!.id)
            .order('week_start', { ascending: false })
            .limit(1),

          supabase
            .from('clinical_reports')
            .select('week_start, overall_score, food_score, mood_score, sleep_score')
            .eq('user_id', user!.id)
            .order('week_start', { ascending: true })
            .limit(8),
        ])

        if (agg.status === 'fulfilled') {
          setDays(
            agg.value.map((d) => ({
              date: d.date,
              label: d.label,
              calories: d.calories,
              protein: d.protein,
              carbs: d.carbs,
              fat: d.fat,
              mood: d.mood,
              moodHue: d.mood ? MOOD_HUES[d.mood] ?? null : null,
              moodIntensity: d.moodIntensity,
              sleepMinutes: d.sleepMinutes,
              sleepQuality: d.sleepQuality,
            })),
          )
        }

        // Clinical report
        if (reportRes.status === 'fulfilled' && reportRes.value.data && reportRes.value.data.length > 0) {
          setReport(reportRes.value.data[0] as ClinicalReport)
        }

        // Score history (oldest → newest)
        if (historyRes.status === 'fulfilled' && historyRes.value.data) {
          setHistory(historyRes.value.data as HistoryPoint[])
        }
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
    // Never send Sage an empty week — the old version generated reports
    // claiming "0 days logged" while the home screen showed real meals.
    if (!days.some((d) => d.calories > 0)) {
      toast('Log a few meals first so Sage has something to analyze', { type: 'info' })
      return
    }
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

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
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

      // Reflect the new/updated week in the trend history
      if (weekStartStr) {
        setHistory((prev) => {
          const point: HistoryPoint = {
            week_start: weekStartStr,
            overall_score: newReport.overall_score,
            food_score: newReport.food_score,
            mood_score: newReport.mood_score,
            sleep_score: newReport.sleep_score,
          }
          const others = prev.filter((p) => p.week_start !== weekStartStr)
          return [...others, point]
            .sort((a, b) => a.week_start.localeCompare(b.week_start))
            .slice(-8)
        })
      }

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
  // Average over LOGGED days only — matches the balance line below it
  // (a 7-day mean including empty days contradicted it in the same card).
  const loggedForAvg = days.filter((d) => d.calories > 0)
  const avgCalories = loggedForAvg.length > 0
    ? Math.round(loggedForAvg.reduce((s, d) => s + d.calories, 0) / loggedForAvg.length)
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

  // Honest with small samples: no "consistency" claims from <3 nights.
  const sleepInsight = avgSleep === null
    ? 'Log sleep to see patterns and insights here.'
    : sleepDays.length < 3
      ? `${sleepDays.length} of 7 nights logged — ${3 - sleepDays.length} more and I can read your consistency.`
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
  // A "pattern" needs at least 2 days on each side of the comparison.
  if (goodMoodAvg !== null && badMoodAvg !== null && goodMoodDays.length >= 2 && badMoodDays.length >= 2) {
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
          borderRadius: 14,
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
                      borderRadius: 14, padding: '14px 16px',
                      borderLeft: `3px solid ${r.priority === 'high' ? 'var(--accent)' : r.priority === 'medium' ? COLOR_MOOD : 'var(--surface-2)'}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
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
          <p style={{ marginBottom: 10, color: 'var(--text-dim)', display: 'flex', justifyContent: 'center' }}><IconSearch size={28} /></p>
          <p style={{ fontSize: 14, fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: 6 }}>
            Your Weekly Report
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
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

      {/* ── Section 1b: Score Trend ── */}
      {history.length >= 2 ? (() => {
        const W = 300
        const H = 90
        const PAD_X = 10
        const PAD_TOP = 8
        const PAD_BOTTOM = 8
        const innerW = W - PAD_X * 2
        const innerH = H - PAD_TOP - PAD_BOTTOM
        const n = history.length
        const pts = history.map((h, i) => {
          const score = h.overall_score ?? 0
          const x = n === 1 ? PAD_X + innerW / 2 : PAD_X + (innerW * i) / (n - 1)
          const y = PAD_TOP + innerH - (Math.max(0, Math.min(10, score)) / 10) * innerH
          return { x, y, score }
        })
        const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        const areaPath = `${linePath} L ${pts[pts.length - 1]!.x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} L ${pts[0]!.x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} Z`
        const latest = history[history.length - 1]!.overall_score ?? 0
        const prev = history[history.length - 2]!.overall_score ?? 0
        const delta = latest - prev
        return (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <Eyebrow style={{ display: 'block', marginBottom: 6 }}>Score Trend</Eyebrow>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500, color: 'var(--text)', lineHeight: 1 }}>
                    {latest.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>/ 10</span>
                  {delta !== 0 && (
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 11,
                      color: delta > 0 ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                last {n} weeks
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              preserveAspectRatio="none"
              style={{ display: 'block', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="mb-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#mb-trend-fill)" />
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === pts.length - 1 ? 3.5 : 2.5}
                  fill={i === pts.length - 1 ? 'var(--accent)' : 'var(--surface)'}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                />
              ))}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {history.map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    color: i === history.length - 1 ? 'var(--accent)' : 'var(--text-dim)',
                    flex: 1,
                    textAlign: 'center',
                  }}
                >
                  {abbrevWeek(h.week_start)}
                </span>
              ))}
            </div>
          </Card>
        )
      })() : history.length === 1 ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45, padding: '0 4px', margin: 0 }}>
          Generate reports across multiple weeks to see your trend.
        </p>
      ) : null}

      {/* ── Section 2: Calorie Balance vs Goal ── */}
      <Card>
        {(() => {
          const loggedDays = days.filter((d) => d.calories > 0)
          const avgBalance =
            loggedDays.length > 0
              ? Math.round(loggedDays.reduce((s, d) => s + (d.calories - goal), 0) / loggedDays.length)
              : 0
          const chartMax = Math.max(maxCalBar, goal * 1.15)
          const H = 80
          // Project a goal date from the average deficit (7700 kcal ≈ 1 kg),
          // only when the user is actually losing toward a set goal.
          let projection: string | null = null
          if (
            loggedDays.length >= 3 &&
            avgBalance < -50 &&
            profile?.goal_weight != null &&
            profile?.weight != null &&
            profile.goal_weight < profile.weight
          ) {
            const kgToGo = profile.weight - profile.goal_weight
            const daysToGo = (kgToGo * 7700) / Math.abs(avgBalance)
            if (daysToGo > 0 && daysToGo < 730) {
              const eta = new Date()
              eta.setDate(eta.getDate() + Math.round(daysToGo))
              projection = `→ ~${profile.goal_weight} kg by ${eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          }
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Eyebrow>Calories vs Goal</Eyebrow>
                <span className="mb-num" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                  avg {avgCalories} kcal · logged days
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.4 }}>
                {loggedDays.length === 0
                  ? `Dashed line is your ${goal} kcal goal — log meals to fill this in.`
                  : `${avgBalance <= 0 ? `Averaging ${Math.abs(avgBalance)} kcal under goal` : `Averaging ${avgBalance} kcal over goal`} on logged days ${projection ?? ''}`}
              </p>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 22 + (goal / chartMax) * H,
                    borderTop: '1.5px dashed var(--accent)',
                    opacity: 0.55,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'flex-end', height: H + 22, gap: 6 }}>
                  {days.map((day) => {
                    const isToday = day.date === todayStr
                    const over = day.calories > goal
                    const barH = Math.max(3, (day.calories / chartMax) * H)
                    return (
                      <div
                        key={day.date}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}
                      >
                        {day.calories > 0 && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
                            {Math.round(day.calories / 100) / 10}k
                          </span>
                        )}
                        <div
                          style={{
                            width: '100%',
                            height: barH,
                            background: day.calories === 0 ? 'var(--surface-2)' : over ? COLOR_SLEEP_WARN : isToday ? 'var(--accent)' : 'var(--accent-wash)',
                            border: day.calories > 0 && !isToday && !over ? '1px solid var(--accent-line)' : 'none',
                            borderRadius: 4,
                            transition: 'height 0.5s cubic-bezier(0.22,1,0.36,1)',
                            boxSizing: 'border-box',
                          }}
                        />
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
                          {day.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )
        })()}
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
            borderRadius: 10,
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
                    borderRadius: 10,
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

      {/* ── Section 5: Weekly Macros — per-day bars so weekday/weekend variation shows ── */}
      <Card>
        <Eyebrow style={{ display: 'block', marginBottom: 16 }}>Weekly Macros</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Protein', key: 'protein' as const, goal: proteinGoal, avg: avgProtein, color: COLOR_PROTEIN },
            { label: 'Carbs', key: 'carbs' as const, goal: carbsGoal, avg: avgCarbs, color: 'oklch(0.72 0.14 85)' },
            { label: 'Fat', key: 'fat' as const, goal: fatGoal, avg: avgFat, color: 'oklch(0.70 0.12 55)' },
          ].map((m) => {
            const maxV = Math.max(...days.map((d) => d[m.key]), m.goal)
            return (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <Eyebrow>{m.label}</Eyebrow>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                    avg {Math.round(m.avg)}<span style={{ fontSize: 9 }}>/{Math.round(m.goal)}g</span>
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: (m.goal / maxV) * 34,
                      borderTop: `1px dashed ${m.color}`,
                      opacity: 0.5,
                      pointerEvents: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
                    {days.map((d) => (
                      <div
                        key={d.date}
                        style={{
                          flex: 1,
                          height: Math.max(2, (d[m.key] / maxV) * 34),
                          background: d.date === todayStr ? m.color : 'var(--surface-2)',
                          borderRadius: 3,
                          transition: 'height 0.5s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
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
          Per-day intake over the past 7 days — dashed lines are your personal targets.
        </p>
      </Card>
    </div>
  )
}
