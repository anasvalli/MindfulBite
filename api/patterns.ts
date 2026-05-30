// Vercel Edge Function — nightly pattern extraction cron
// Fetches all active users via service role, calls Claude Haiku to extract
// behavioral patterns, upserts into ai_user_model table.
//
// Schedule: 0 2 * * * (2 AM UTC daily via vercel.json crons)
//
// Auth rules:
//   1. Vercel cron header (x-vercel-cron: 1) — full run over all active users
//   2. Authorization: Bearer {CRON_SECRET} — same as above, for manual server-side calls
//   3. x-manual-trigger: 1 — only processes the userId supplied in the JSON body

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealRow {
  user_id: string
  total_calories: number
  macros_json: Record<string, number> | null
  created_at: string
}

interface MoodRow {
  mood: string
  intensity: number
  context: string | null
  logged_at: string
}

interface SleepRow {
  duration_minutes: number
  quality_score: number | null
  date: string
}

interface ExtractedPatterns {
  patterns: Array<{
    type: 'food' | 'mood' | 'sleep' | 'correlation'
    description: string
    confidence: number
  }>
  food_quality_score: number
  mood_stability_score: number
  sleep_debt_hours: number
}

// ─── Supabase helper ──────────────────────────────────────────────────────────

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

// ─── Pattern extraction via Claude Haiku ─────────────────────────────────────

async function extractPatterns(
  userId: string,
  meals: MealRow[],
  moods: MoodRow[],
  sleep: SleepRow[],
): Promise<ExtractedPatterns> {
  const fallback: ExtractedPatterns = {
    patterns: [],
    food_quality_score: 5,
    mood_stability_score: 5,
    sleep_debt_hours: 0,
  }

  if (!ANTHROPIC_KEY) {
    console.error(`[patterns] ANTHROPIC_API_KEY not set — skipping user ${userId}`)
    return fallback
  }

  const prompt = `Analyze this user's 30-day wellness data and extract behavioral patterns.

MEALS (${meals.length} logged):
${JSON.stringify(meals.slice(-20))}

MOODS (${moods.length} logged):
${JSON.stringify(moods.slice(-20))}

SLEEP (${sleep.length} logged):
${JSON.stringify(sleep.slice(-20))}

Return ONLY valid JSON (no markdown):
{
  "patterns": [
    {"type": "food|mood|sleep|correlation", "description": "specific pattern observed", "confidence": 0.0-1.0}
  ],
  "food_quality_score": 1-10,
  "mood_stability_score": 1-10,
  "sleep_debt_hours": number
}

Guidelines:
- patterns: max 5, only include if confidence > 0.6, be very specific (e.g. "Eats 40% more calories on days logged as Tense" not "eats more when stressed")
- food_quality_score: based on calorie consistency relative to a 2150 goal, protein, variety
- mood_stability_score: based on mood variance and trend
- sleep_debt_hours: hours below 7h/night accumulated this week (0 if no sleep data)`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    console.error(`[patterns] Anthropic fetch error for user ${userId}:`, err)
    return fallback
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[patterns] Anthropic API error for user ${userId} (${res.status}):`, errText)
    return fallback
  }

  let data: { content?: Array<{ type: string; text: string }> }
  try {
    data = await res.json()
  } catch (err) {
    console.error(`[patterns] Failed to parse Anthropic response for user ${userId}:`, err)
    return fallback
  }

  const text = data.content?.find((c) => c.type === 'text')?.text ?? '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    console.warn(`[patterns] No JSON found in Claude response for user ${userId}`)
    return fallback
  }

  try {
    const parsed = JSON.parse(match[0]) as Partial<ExtractedPatterns>
    return {
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      food_quality_score: typeof parsed.food_quality_score === 'number' ? parsed.food_quality_score : 5,
      mood_stability_score: typeof parsed.mood_stability_score === 'number' ? parsed.mood_stability_score : 5,
      sleep_debt_hours: typeof parsed.sleep_debt_hours === 'number' ? parsed.sleep_debt_hours : 0,
    }
  } catch (err) {
    console.error(`[patterns] Failed to parse Claude JSON for user ${userId}:`, err)
    return fallback
  }
}

// ─── Per-user processing ──────────────────────────────────────────────────────

async function processUser(userId: string): Promise<{ userId: string; status: 'ok' | 'error'; patternsCount?: number; error?: string }> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgoDate = thirtyDaysAgo.split('T')[0]

    const [meals, moods, sleep] = await Promise.all([
      sbFetch(
        `meals?user_id=eq.${userId}&created_at=gte.${thirtyDaysAgo}&select=total_calories,macros_json,created_at`
      ) as Promise<MealRow[]>,
      sbFetch(
        `mood_checkins?user_id=eq.${userId}&logged_at=gte.${thirtyDaysAgo}&select=mood,intensity,context,logged_at`
      ) as Promise<MoodRow[]>,
      sbFetch(
        `sleep_logs?user_id=eq.${userId}&date=gte.${thirtyDaysAgoDate}&select=duration_minutes,quality_score,date`
      ) as Promise<SleepRow[]>,
    ])

    const patterns = await extractPatterns(userId, meals, moods, sleep)

    // Upsert into ai_user_model (merge-duplicates on user_id primary key)
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/ai_user_model`, {
      method: 'POST',
      headers: {
        ...sbHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        patterns: patterns.patterns,
        food_quality_score: patterns.food_quality_score,
        mood_stability_score: patterns.mood_stability_score,
        sleep_debt_hours: patterns.sleep_debt_hours,
        last_extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    })

    if (!upsertRes.ok) {
      const errText = await upsertRes.text()
      throw new Error(`Upsert failed (${upsertRes.status}): ${errText}`)
    }

    return { userId, status: 'ok', patternsCount: patterns.patterns.length }
  } catch (err) {
    // Per-user errors are caught here so other users continue processing
    console.error(`[patterns] Error processing user ${userId}:`, err)
    return { userId, status: 'error', error: String(err) }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const cronHeader = req.headers.get('x-vercel-cron')
  const authHeader = req.headers.get('authorization')
  const manualHeader = req.headers.get('x-manual-trigger')
  const secret = process.env.CRON_SECRET

  const isVercelCron = cronHeader === '1'
  const isAuthorized = Boolean(secret && authHeader === `Bearer ${secret}`)
  const isManualTrigger = manualHeader === '1' && isAuthorized
  // Manual trigger now requires the secret too — removed the unauthenticated path

  if (!isVercelCron && !isAuthorized && !isManualTrigger) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Only POST (or Vercel cron, which sends GET) is allowed
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Env check ───────────────────────────────────────────────────────────────
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const startedAt = new Date().toISOString()
  let userIds: string[] = []

  // ── Manual trigger — process only the supplied userId ─────────────────────
  if (isManualTrigger) {
    let body: { userId?: string } = {}
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body — expected { userId: string }' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (!body.userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required for manual trigger' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    userIds = [body.userId]
  } else {
    // ── Cron / authorized run — find all users active in last 7 days ──────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    let activeMeals: Array<{ user_id: string }>
    try {
      activeMeals = (await sbFetch(
        `meals?select=user_id&created_at=gte.${sevenDaysAgo}`
      )) as Array<{ user_id: string }>
    } catch (err) {
      console.error('[patterns] Failed to fetch active users:', err)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch active users', details: String(err) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    userIds = [...new Set(activeMeals.map((r) => r.user_id))]
  }

  if (userIds.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, results: [], timestamp: startedAt }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Process each user sequentially to avoid rate-limit spikes ──────────────
  // Each user is individually try/caught inside processUser so one failure
  // never blocks the rest of the batch.
  const results = []
  for (const userId of userIds) {
    results.push(await processUser(userId))
  }

  const successCount = results.filter((r) => r.status === 'ok').length
  const errorCount = results.filter((r) => r.status === 'error').length

  console.log(
    `[patterns] Done — ${successCount} ok, ${errorCount} errors out of ${userIds.length} users processed at ${startedAt}`
  )

  return new Response(
    JSON.stringify({
      processed: userIds.length,
      success: successCount,
      errors: errorCount,
      results,
      timestamp: startedAt,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
