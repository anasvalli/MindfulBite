// Vercel Edge Function — generates clinical insight reports using Claude Sonnet
// Receives pre-fetched user data from frontend, returns structured report

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

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

  let body: {
    meals: MealDay[]
    moods: MoodDay[]
    sleep: SleepDay[]
    profile: UserProfile
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { meals = [], moods = [], sleep = [], profile = {} } = body

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

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(JSON.stringify({ error: 'AI service error', details: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await anthropicRes.json() as {
      content: Array<{ type: string; text: string }>
    }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '{}'

    // Parse JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }
    const report = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify(report), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Insights generation error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to generate report', details: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
