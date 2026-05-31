// Vercel Edge Function — proactive "Insight of the day" from Sage.
// Pulls the user's recent data + learned patterns + primary goal and returns ONE
// specific, warm observation with a short suggested action. JWT-verified.
// The client caches it per-day (one cheap Haiku call per user per day).

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !SERVICE_KEY) {
    return new Response(JSON.stringify({ insight: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify JWT → userId
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  let userId = ''
  if (token) {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (u.ok) userId = ((await u.json()) as { id?: string }).id ?? ''
  }
  if (!userId) {
    return new Response(JSON.stringify({ insight: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  const base = `${SUPABASE_URL}/rest/v1`
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sinceDate = since.split('T')[0]

  try {
    const [profRes, mealsRes, moodRes, sleepRes, modelRes] = await Promise.all([
      fetch(`${base}/users?id=eq.${userId}&select=full_name,primary_goal,daily_calorie_goal,protein_goal,weight,goal_weight`, { headers: h }),
      fetch(`${base}/meals?user_id=eq.${userId}&created_at=gte.${since}&select=total_calories,macros_json,created_at`, { headers: h }),
      fetch(`${base}/mood_checkins?user_id=eq.${userId}&logged_at=gte.${since}&select=mood,intensity,logged_at`, { headers: h }),
      fetch(`${base}/sleep_logs?user_id=eq.${userId}&date=gte.${sinceDate}&select=duration_minutes,quality_score,date`, { headers: h }),
      fetch(`${base}/ai_user_model?user_id=eq.${userId}&select=patterns`, { headers: h }),
    ])
    const profile = profRes.ok ? (await profRes.json())[0] ?? {} : {}
    const meals = mealsRes.ok ? await mealsRes.json() : []
    const moods = moodRes.ok ? await moodRes.json() : []
    const sleep = sleepRes.ok ? await sleepRes.json() : []
    const patterns = modelRes.ok ? ((await modelRes.json())[0]?.patterns ?? []) : []

    // If the user has basically no data yet, return a gentle starter nudge (no AI cost).
    const totalLogs = meals.length + moods.length + sleep.length
    if (totalLogs === 0) {
      return new Response(JSON.stringify({
        insight: "Let's get started — snap or log your first meal today and I'll start spotting what works for you.",
        cta: 'Log a meal',
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    const calByDay: Record<string, number> = {}
    meals.forEach((m: any) => {
      const d = new Date(m.created_at).toISOString().split('T')[0]
      calByDay[d] = (calByDay[d] ?? 0) + (m.total_calories ?? 0)
    })
    const avgCal = Object.values(calByDay).length
      ? Math.round(Object.values(calByDay).reduce((a, b) => a + b, 0) / Object.values(calByDay).length)
      : 0
    const moodCounts: Record<string, number> = {}
    moods.forEach((m: any) => { moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1 })
    const avgSleep = sleep.length
      ? Math.round(sleep.reduce((s: number, d: any) => s + (d.duration_minutes ?? 0), 0) / sleep.length)
      : 0

    const dataSummary = `
Goal: ${profile.primary_goal ?? 'not set'}
Calorie goal: ${profile.daily_calorie_goal ?? 'n/a'}; protein goal: ${profile.protein_goal ?? 'n/a'}g
Weight: ${profile.weight ?? 'n/a'}kg → goal ${profile.goal_weight ?? 'n/a'}kg
Last 7 days — days logged: ${Object.keys(calByDay).length}, avg calories: ${avgCal}
Mood check-ins: ${JSON.stringify(moodCounts)}
Avg sleep: ${avgSleep ? `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m` : 'no data'} over ${sleep.length} nights
Learned patterns: ${patterns.length ? patterns.map((p: any) => p.description).slice(-5).join('; ') : 'none yet'}`

    const system = `You are Sage, a warm nutritionist + wellness psychologist. Generate ONE proactive "insight of the day" for this user — something you noticed in their data that connects food, mood, sleep, or progress toward their goal. Be specific (reference a real number or pattern), warm, and non-judgmental. Then give ONE short, concrete suggested action.

Respond with ONLY valid JSON: {"insight": "<1-2 sentence observation>", "cta": "<short action label, max 4 words>"}`

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: `Here is my data:\n${dataSummary}\n\nGive me today's insight.` }],
      }),
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ insight: null }), { headers: { 'Content-Type': 'application/json' } })
    }
    const json = (await res.json()) as { content: Array<{ type: string; text: string }> }
    const text = json.content?.find((c) => c.type === 'text')?.text ?? '{}'
    const m = text.match(/\{[\s\S]*\}/)
    let out: { insight: string | null; cta?: string } = { insight: null }
    try { if (m) out = JSON.parse(m[0]) } catch { /* keep null */ }

    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ insight: null }), { headers: { 'Content-Type': 'application/json' } })
  }
}
