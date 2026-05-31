// Vercel Edge Function — weekly clinical insights cron
// For every user active in the last 7 days, fetches their food/mood/sleep data
// via the service role key, calls Claude Sonnet to produce a scored clinical
// report (same JSON contract as api/insights.ts), and upserts it into the
// clinical_reports table keyed on (user_id, week_start).
//
// Schedule: 0 3 * * 1 (Mondays 3 AM UTC via vercel.json crons)
//
// Auth rules (mirrors api/patterns.ts):
//   1. Vercel cron header (x-vercel-cron: 1)
//   2. Authorization: Bearer {CRON_SECRET} — for manual server-side calls

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? ''

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealRow {
  total_calories: number
  macros_json: { protein?: number; carbs?: number; fat?: number } | null
  created_at: string
}

interface MoodRow {
  mood: string
  intensity: number | null
  logged_at: string
}

interface SleepRow {
  duration_minutes: number | null
  quality_score: number | null
  date: string
}

interface ProfileRow {
  daily_calorie_goal?: number | null
  weight?: number | null
  goal_weight?: number | null
  full_name?: string | null
  dietary_prefs?: string | null
}

// Shapes that api/insights.ts expects
interface MealDay { date: string; calories: number; protein: number; carbs: number; fat: number }
interface MoodDay { date: string; mood: string; intensity: number }
interface SleepDay { date: string; durationMinutes: number; quality: number }
interface UserProfile {
  daily_calorie_goal?: number
  weight?: number
  goal_weight?: number
  dietary_prefs?: string
  full_name?: string
}

interface ClinicalReport {
  food_score: number
  mood_score: number
  sleep_score: number
  overall_score: number
  summary: string
  recommendations: Array<{ title: string; body: string; priority: string }>
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function sbHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function sbFetch(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: sbHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase fetch failed (${res.status}): ${text}`)
  }
  return res.json()
}

function dateKey(raw: string): string {
  return new Date(raw).toISOString().split('T')[0] ?? ''
}

// ─── Claude Sonnet report generation ────────────────────────────────────────
// Mirrors the prompt + JSON contract of api/insights.ts.

async function generateReport(
  meals: MealDay[],
  moods: MoodDay[],
  sleep: SleepDay[],
  profile: UserProfile,
): Promise<ClinicalReport> {
  const calorieGoal = profile.daily_calorie_goal ?? 2150
  const avgCalories = meals.length
    ? Math.round(meals.reduce((s, m) => s + m.calories, 0) / meals.length)
    : 0
  const avgProtein = meals.length
    ? Math.round(meals.reduce((s, m) => s + m.protein, 0) / meals.length)
    : 0
  const avgSleep = sleep.length
    ? Math.round(sleep.reduce((s, d) => s + d.durationMinutes, 0) / sleep.length)
    : 0
  const avgSleepQuality = sleep.length
    ? (sleep.reduce((s, d) => s + d.quality, 0) / sleep.length).toFixed(1)
    : 'N/A'
  const moodCounts: Record<string, number> = {}
  moods.forEach((m) => { moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1 })
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown'

  const dataPrompt = `
USER DATA (last 7 days):
- Name: ${profile.full_name ?? 'User'}
- Calorie goal: ${calorieGoal} kcal/day
- Weight: ${profile.weight ? `${profile.weight}kg` : 'not set'}
- Dietary preferences: ${profile.dietary_prefs ?? 'none'}
- Days with meals logged: ${meals.length}/7
- Average daily calories: ${avgCalories} kcal (goal: ${calorieGoal})
- Average daily protein: ${avgProtein}g
- Average sleep duration: ${avgSleep ? `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m` : 'no data'}
- Average sleep quality: ${avgSleepQuality}/5
- Days with mood logged: ${moods.length}/7
- Dominant mood this week: ${dominantMood}
- Mood breakdown: ${JSON.stringify(moodCounts)}

Daily breakdown:
Meals: ${JSON.stringify(meals)}
Moods: ${JSON.stringify(moods)}
Sleep: ${JSON.stringify(sleep)}
`

  const systemPrompt = `You are a clinical wellness analyst for MindfulBite. Generate a structured weekly health report based on the user's actual data.

You must respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "food_score": <number 1-10>,
  "mood_score": <number 1-10>,
  "sleep_score": <number 1-10>,
  "overall_score": <number 1-10>,
  "summary": "<2 sentence warm, honest overall summary of their week>",
  "recommendations": [
    {
      "title": "<short title>",
      "body": "<2 sentence specific, actionable advice>",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Scoring guidelines:
- food_score: Based on calorie consistency (within 15% of goal = high), protein adequacy, variety, days logged. Days with no data count against consistency.
- mood_score: Based on mood distribution (Radiant/Calm = positive, Tired/Tense/Low = negative), intensity levels, and trends. Low check-in frequency lowers score.
- sleep_score: Based on average duration (7-9h ideal), quality score, consistency. No data = 5/10 baseline.
- overall_score: Weighted average (food 35%, mood 35%, sleep 30%).

Always include exactly 3 recommendations ordered by priority. Be specific and warm — reference their actual numbers. Never be alarmist.`

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: dataPrompt }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errText}`)
  }

  const data = await res.json() as { content?: Array<{ type: string; text: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON found in Claude response')
  }
  return JSON.parse(match[0]) as ClinicalReport
}

// ─── Per-user processing ──────────────────────────────────────────────────────

async function processUser(
  userId: string,
  weekStart: string,
  sevenDaysAgo: string,
  sevenDaysAgoDate: string,
): Promise<{ userId: string; status: 'ok' | 'error'; overall_score?: number; error?: string }> {
  try {
    const [mealRows, moodRows, sleepRows, profileRows] = await Promise.all([
      sbFetch(
        `meals?user_id=eq.${userId}&created_at=gte.${sevenDaysAgo}&select=total_calories,macros_json,created_at`
      ) as Promise<MealRow[]>,
      sbFetch(
        `mood_checkins?user_id=eq.${userId}&logged_at=gte.${sevenDaysAgo}&select=mood,intensity,logged_at`
      ) as Promise<MoodRow[]>,
      sbFetch(
        `sleep_logs?user_id=eq.${userId}&date=gte.${sevenDaysAgoDate}&select=duration_minutes,quality_score,date`
      ) as Promise<SleepRow[]>,
      sbFetch(
        `profiles?id=eq.${userId}&select=daily_calorie_goal,weight,goal_weight,full_name,dietary_prefs&limit=1`
      ) as Promise<ProfileRow[]>,
    ])

    // Shape meals into per-day aggregates (sum calories + macros per calendar day)
    const mealByDay = new Map<string, MealDay>()
    for (const row of mealRows) {
      const date = dateKey(row.created_at)
      if (!date) continue
      const existing = mealByDay.get(date) ?? { date, calories: 0, protein: 0, carbs: 0, fat: 0 }
      existing.calories += row.total_calories ?? 0
      existing.protein += row.macros_json?.protein ?? 0
      existing.carbs += row.macros_json?.carbs ?? 0
      existing.fat += row.macros_json?.fat ?? 0
      mealByDay.set(date, existing)
    }
    const meals: MealDay[] = [...mealByDay.values()].sort((a, b) => a.date.localeCompare(b.date))

    // Shape moods — keep latest mood per day
    const moodByDay = new Map<string, MoodDay>()
    for (const row of moodRows) {
      const date = dateKey(row.logged_at)
      if (!date) continue
      moodByDay.set(date, { date, mood: row.mood, intensity: row.intensity ?? 3 })
    }
    const moods: MoodDay[] = [...moodByDay.values()].sort((a, b) => a.date.localeCompare(b.date))

    // Shape sleep
    const sleep: SleepDay[] = sleepRows
      .map((row) => ({
        date: row.date,
        durationMinutes: row.duration_minutes ?? 0,
        quality: row.quality_score ?? 3,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const profileRow = profileRows[0] ?? {}
    const profile: UserProfile = {
      daily_calorie_goal: profileRow.daily_calorie_goal ?? undefined,
      weight: profileRow.weight ?? undefined,
      goal_weight: profileRow.goal_weight ?? undefined,
      full_name: profileRow.full_name ?? undefined,
      dietary_prefs: profileRow.dietary_prefs ?? undefined,
    }

    const report = await generateReport(meals, moods, sleep, profile)

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/clinical_reports`, {
      method: 'POST',
      headers: {
        ...sbHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        week_start: weekStart,
        food_score: report.food_score,
        mood_score: report.mood_score,
        sleep_score: report.sleep_score,
        overall_score: report.overall_score,
        recommendations: report.recommendations,
        summary: report.summary,
        generated_at: new Date().toISOString(),
      }),
    })

    if (!upsertRes.ok) {
      const errText = await upsertRes.text()
      throw new Error(`Upsert failed (${upsertRes.status}): ${errText}`)
    }

    return { userId, status: 'ok', overall_score: report.overall_score }
  } catch (err) {
    // Per-user errors are caught here so one failure never blocks the batch.
    console.error(`[weekly-insights] Error processing user ${userId}:`, err)
    return { userId, status: 'error', error: String(err) }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  // ── Auth check (mirrors api/patterns.ts) ──────────────────────────────────
  const cronHeader = req.headers.get('x-vercel-cron')
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  const isVercelCron = cronHeader === '1'
  const isAuthorized = Boolean(secret && authHeader === `Bearer ${secret}`)

  if (!isVercelCron && !isAuthorized) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Env check ──────────────────────────────────────────────────────────────
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!ANTHROPIC_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const startedAt = new Date().toISOString()

  // ── Compute week_start = Monday of current week (YYYY-MM-DD) ────────────────
  const now = new Date()
  const monday = new Date(now)
  const day = monday.getUTCDay() // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? 6 : day - 1 // days since most recent Monday
  monday.setUTCDate(monday.getUTCDate() - diff)
  const weekStart = monday.toISOString().split('T')[0] ?? ''

  const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgoDate = sevenDaysAgoISO.split('T')[0] ?? ''

  // ── Find users active in last 7 days (distinct user_id from meals) ─────────
  let activeMeals: Array<{ user_id: string }>
  try {
    activeMeals = (await sbFetch(
      `meals?select=user_id&created_at=gte.${sevenDaysAgoISO}`
    )) as Array<{ user_id: string }>
  } catch (err) {
    console.error('[weekly-insights] Failed to fetch active users:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch active users', details: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const userIds = [...new Set(activeMeals.map((r) => r.user_id))]

  if (userIds.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, results: [], week_start: weekStart, timestamp: startedAt }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Process each user sequentially to avoid rate-limit spikes ──────────────
  const results = []
  for (const userId of userIds) {
    results.push(await processUser(userId, weekStart, sevenDaysAgoISO, sevenDaysAgoDate))
  }

  const successCount = results.filter((r) => r.status === 'ok').length
  const errorCount = results.filter((r) => r.status === 'error').length

  console.log(
    `[weekly-insights] Done — ${successCount} ok, ${errorCount} errors out of ${userIds.length} users for week ${weekStart} at ${startedAt}`
  )

  return new Response(
    JSON.stringify({
      processed: userIds.length,
      success: successCount,
      errors: errorCount,
      week_start: weekStart,
      results,
      timestamp: startedAt,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
