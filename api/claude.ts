// Vercel Edge Function — proxies chat messages to Claude Haiku
// Uses structured tool use so Sage can query real-time user data from Supabase

export const config = { runtime: 'edge' }

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_todays_nutrition',
    description:
      "Get the user's nutrition summary for today — calories eaten, macros, and meals logged. Use this when the user asks about today's intake, remaining calories, or what they've eaten.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_weekly_trends',
    description:
      "Get the user's holistic 7-day picture: average calories & protein, mood distribution & check-in count, sleep duration, weight trend, and hydration. Use this for weekly analysis, to connect food↔mood↔sleep↔weight, or whenever you need the whole-health context to give a complete answer.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_sleep_summary',
    description:
      "Get the user's recent sleep data including last night's sleep and weekly average. Use this when the user asks about sleep, energy levels, or fatigue.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_mood_history',
    description:
      "Get the user's mood check-ins from the past 7 days. Use this when discussing emotional wellbeing, stress, or mood patterns.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ai_patterns',
    description:
      "Get the AI-extracted behavioral patterns for this user from the last analysis run. Use this for personalized insights or when asked about patterns.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// ---------------------------------------------------------------------------
// Supabase tool execution
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  userId: string,
  serviceKey: string,
  supabaseUrl: string,
): Promise<string> {
  if (!userId) {
    return JSON.stringify({ error: 'No user ID provided — cannot query user data.' })
  }

  if (!serviceKey) {
    return JSON.stringify({ error: 'Service not configured. I can still help based on your profile context.' })
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }
  const base = supabaseUrl + '/rest/v1'
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  switch (toolName) {
    case 'get_todays_nutrition': {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const res = await fetch(
        `${base}/meals?user_id=eq.${userId}&created_at=gte.${todayStart.toISOString()}&select=total_calories,macros_json,items_json,created_at`,
        { headers },
      )
      if (!res.ok) {
        return JSON.stringify({ error: `Supabase query failed: ${res.status}` })
      }
      const meals = await res.json()
      const totalCal = meals.reduce((s: number, m: any) => s + (m.total_calories ?? 0), 0)
      const totalProtein = meals.reduce((s: number, m: any) => s + (m.macros_json?.protein ?? 0), 0)
      const totalCarbs = meals.reduce((s: number, m: any) => s + (m.macros_json?.carbs ?? 0), 0)
      const totalFat = meals.reduce((s: number, m: any) => s + (m.macros_json?.fat ?? 0), 0)
      const mealNames = meals.flatMap((m: any) => (m.items_json ?? []).map((i: any) => i.name))
      return JSON.stringify({
        meals_logged: meals.length,
        total_calories: Math.round(totalCal),
        protein_g: Math.round(totalProtein),
        carbs_g: Math.round(totalCarbs),
        fat_g: Math.round(totalFat),
        foods_eaten: mealNames.slice(0, 10),
      })
    }

    case 'get_weekly_trends': {
      const sevenDayDate = sevenDaysAgo.split('T')[0]
      const [mealsRes, moodsRes, sleepRes, weightRes, waterRes] = await Promise.all([
        fetch(
          `${base}/meals?user_id=eq.${userId}&created_at=gte.${sevenDaysAgo}&select=total_calories,macros_json,created_at`,
          { headers },
        ),
        fetch(
          `${base}/mood_checkins?user_id=eq.${userId}&logged_at=gte.${sevenDaysAgo}&select=mood,intensity,logged_at`,
          { headers },
        ),
        fetch(
          `${base}/sleep_logs?user_id=eq.${userId}&date=gte.${sevenDayDate}&select=duration_minutes,quality_score,date`,
          { headers },
        ),
        fetch(
          `${base}/weight_logs?user_id=eq.${userId}&date=gte.${sevenDayDate}&select=weight_kg,date&order=date.asc`,
          { headers },
        ),
        fetch(
          `${base}/water_logs?user_id=eq.${userId}&date=gte.${sevenDayDate}&select=amount_ml,date`,
          { headers },
        ),
      ])
      if (!mealsRes.ok || !moodsRes.ok || !sleepRes.ok) {
        return JSON.stringify({ error: 'One or more Supabase queries failed for weekly trends.' })
      }
      const meals = await mealsRes.json()
      const moods = await moodsRes.json()
      const sleep = await sleepRes.json()
      const weights = weightRes.ok ? await weightRes.json() : []
      const water = waterRes.ok ? await waterRes.json() : []
      const avgCal =
        meals.length
          ? Math.round(meals.reduce((s: number, m: any) => s + m.total_calories, 0) / meals.length)
          : 0
      const avgProtein =
        meals.length
          ? Math.round(meals.reduce((s: number, m: any) => s + (m.macros_json?.protein ?? 0), 0) / meals.length)
          : 0
      const moodCounts: Record<string, number> = {}
      moods.forEach((m: any) => {
        moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1
      })
      const avgSleep =
        sleep.length
          ? Math.round(
              sleep.reduce((s: number, d: any) => s + (d.duration_minutes ?? 0), 0) / sleep.length,
            )
          : 0
      // Water: total ml per day, then average across days that have entries
      const waterByDay: Record<string, number> = {}
      water.forEach((w: any) => { waterByDay[w.date] = (waterByDay[w.date] ?? 0) + (w.amount_ml ?? 0) })
      const waterDays = Object.values(waterByDay)
      const avgWaterMl = waterDays.length ? Math.round(waterDays.reduce((a, b) => a + b, 0) / waterDays.length) : 0
      const weightTrend =
        weights.length >= 2
          ? `${weights[0].weight_kg}kg → ${weights[weights.length - 1].weight_kg}kg over ${weights.length} logs`
          : weights.length === 1
            ? `${weights[0].weight_kg}kg (single log)`
            : 'no weight logs'
      return JSON.stringify({
        days_with_meals: meals.length,
        avg_daily_calories: avgCal,
        avg_daily_protein_g: avgProtein,
        mood_distribution: moodCounts,
        mood_checkins_count: moods.length,
        days_with_sleep_logged: sleep.length,
        avg_sleep_minutes: avgSleep,
        avg_sleep_formatted: avgSleep ? `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m` : 'no data',
        weight_trend: weightTrend,
        avg_daily_water_ml: avgWaterMl,
      })
    }

    case 'get_sleep_summary': {
      const res = await fetch(
        `${base}/sleep_logs?user_id=eq.${userId}&order=date.desc&limit=7&select=*`,
        { headers },
      )
      if (!res.ok) {
        return JSON.stringify({ error: `Supabase query failed: ${res.status}` })
      }
      const logs = await res.json()
      const lastNight = logs[0]
      const avgMin =
        logs.length
          ? Math.round(
              logs.reduce((s: number, d: any) => s + (d.duration_minutes ?? 0), 0) / logs.length,
            )
          : 0
      return JSON.stringify({
        last_night: lastNight
          ? {
              date: lastNight.date,
              duration: `${Math.floor((lastNight.duration_minutes ?? 0) / 60)}h ${(lastNight.duration_minutes ?? 0) % 60}m`,
              quality_score: lastNight.quality_score,
              bedtime: lastNight.bedtime,
              wake_time: lastNight.wake_time,
            }
          : null,
        weekly_average: avgMin ? `${Math.floor(avgMin / 60)}h ${avgMin % 60}m` : 'no data',
        days_logged: logs.length,
      })
    }

    case 'get_mood_history': {
      const res = await fetch(
        `${base}/mood_checkins?user_id=eq.${userId}&logged_at=gte.${sevenDaysAgo}&order=logged_at.desc&select=mood,intensity,context,notes,logged_at`,
        { headers },
      )
      if (!res.ok) {
        return JSON.stringify({ error: `Supabase query failed: ${res.status}` })
      }
      const checkins = await res.json()
      return JSON.stringify({ checkins: checkins.slice(0, 10), total: checkins.length })
    }

    case 'get_ai_patterns': {
      const res = await fetch(
        `${base}/ai_user_model?user_id=eq.${userId}&select=patterns,food_quality_score,mood_stability_score,sleep_debt_hours,last_extracted_at`,
        { headers },
      )
      if (!res.ok) {
        return JSON.stringify({ error: `Supabase query failed: ${res.status}` })
      }
      const models = await res.json()
      return models.length
        ? JSON.stringify(models[0])
        : JSON.stringify({ patterns: [], message: 'No patterns extracted yet' })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------

async function callClaude(
  messages: any[],
  system: string,
  apiKey: string,
  tools: any[],
): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // Sonnet for the nuanced nutritionist + psychologist synthesis Sage needs.
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system,
      tools,
      messages,
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${await res.text()}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Edge handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  let body: {
    message: string
    history: Array<{ role: string; text: string }>
    userContext: string
    personality?: 'warm' | 'direct' | 'clinical'
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, history = [], userContext = '', personality = 'warm' } = body

  const personalityPrefix =
    personality === 'direct'
      ? 'TONE: Direct and concise. Lead with the insight and the one action that matters. Minimal pleasantries, but never cold.'
      : personality === 'clinical'
        ? 'TONE: Precise and evidence-based. Reference specific numbers, macros, and physiological/psychological mechanisms. Professional, like a clinician explaining clearly.'
        : 'TONE: Warm, validating, and encouraging — like a trusted practitioner who genuinely cares. Lead with empathy, then guidance.'

  // Verify JWT from Authorization header and extract userId server-side
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  let userId = ''
  if (token) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (userRes.ok) {
      const userData = await userRes.json() as { id?: string }
      userId = userData.id ?? ''
    }
  }
  // userId is now verified from JWT — if empty, tool calls will fail gracefully with the existing guard

  const systemPrompt = `${personalityPrefix}

You are Sage, the wellbeing companion inside MindfulBite. You hold TWO areas of expertise and you bring BOTH to every conversation:

1. REGISTERED NUTRITIONIST — you understand calories, macronutrients (protein/carbs/fat), nutrient timing, hydration, dietary patterns, and how food affects energy, blood sugar, satiety, and body composition. You translate the user's real numbers and goals into specific, practical food guidance.

2. WELLNESS PSYCHOLOGIST — you understand the mind-body connection: emotional eating, stress, the gut-brain axis, how sleep and blood sugar shape mood and cravings, and behavior-change psychology. You validate feelings first, reframe gently (never preachy), and help the user build a kind, sustainable relationship with food and themselves.

YOUR CORE SKILL is SYNTHESIS — you connect the dots across food, mood, sleep, hydration, weight, and activity into one coherent picture of the person's overall health. You don't treat these as separate silos. Examples of the connections you look for:
- A high-carb, low-protein meal → an energy/blood-sugar dip ~90 min later → a low or irritable mood.
- Poor or short sleep → higher next-day cravings, lower willpower, and worse mood.
- Under-eating or skipped protein → fatigue, low mood, poor recovery.
- "Low"/"Tense" moods clustering around certain foods, times, or low-hydration days → likely emotional-eating or fuel patterns worth naming gently.
- Steady protein + good sleep + hydration → stable mood and energy; reinforce what's working.

HOW YOU WORK:
- ALWAYS pull real data with tools before advising. Use get_todays_nutrition for today's food, get_weekly_trends for the holistic week (food + mood + sleep + weight + water), get_sleep_summary, get_mood_history, and get_ai_patterns for learned patterns. When a question touches mood OR energy, ALSO check nutrition and sleep — the cause is usually cross-domain.
- Be specific and numeric as a nutritionist (use their actual calorie/protein/macro targets — calculate the gap, name foods that close it).
- Be empathetic and human as a psychologist (acknowledge the emotion, normalize, encourage — one slow day is information, not failure).
- Then connect them: explain the likely *why* behind how they feel using their food/sleep data.

RESPONSE STYLE:
- Conversational and tight: usually 3-5 sentences. Go a little longer only when the user is struggling emotionally and needs real support; stay shorter for quick factual questions.
- Reference their actual numbers. Offer one clear, doable next step.
- Never lecture, never shame, never moralize food as "good/bad."

SAFETY (important):
- You are a supportive coach, NOT a doctor. Don't diagnose conditions or prescribe; for medical concerns, suggest they consult a professional.
- Be alert to disordered-eating signals (extreme restriction, purging talk, obsessive control, very low intake). Never encourage these — respond with care and gently suggest professional support.
- If the user expresses serious distress, hopelessness, or self-harm, drop the coaching, respond with compassion, and point them to a mental-health professional or local crisis line.

User profile context:
${userContext || 'New user — no data yet. Welcome them warmly, briefly explain you look at food, mood, sleep, and overall health together, and encourage their first log.'}`

  // Convert history to Anthropic message format, skipping the initial greeting
  const anthropicMessages: any[] = history
    .filter((_, i) => i > 0) // skip first assistant message (greeting)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

  // Add the new user message
  anthropicMessages.push({ role: 'user', content: message })

  // ---------------------------------------------------------------------------
  // Agentic tool-use loop (max 3 iterations)
  // ---------------------------------------------------------------------------

  const MAX_ITERATIONS = 3
  let iterations = 0
  let response: any

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++

      response = await callClaude(anthropicMessages, systemPrompt, apiKey, TOOLS)

      // If Claude didn't request any tools, we're done
      if (response.stop_reason !== 'tool_use') break

      // Collect tool_use blocks from the response
      const toolUses = (response.content as any[]).filter((c: any) => c.type === 'tool_use')

      // Guard: if stop_reason is tool_use but there are no blocks, exit
      if (toolUses.length === 0) break

      // Append Claude's full response (including tool_use blocks) to messages
      anthropicMessages.push({ role: 'assistant', content: response.content })

      // Execute all requested tools in parallel
      const toolResults = await Promise.all(
        toolUses.map(async (tu: any) => ({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: await executeTool(tu.name, userId, SERVICE_KEY, SUPABASE_URL),
        })),
      )

      // Return results as a user turn
      anthropicMessages.push({ role: 'user', content: toolResults })
    }

    // Extract the final text reply
    const reply =
      (response?.content as any[])?.find((c: any) => c.type === 'text')?.text ??
      "I'm here to help with your wellness journey!"

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Claude tool-use loop error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to reach AI service' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
