// Vercel Edge Function — generates a narrative weekly wellness report using Claude Sonnet
// Receives pre-fetched user data from frontend, returns a markdown narrative

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
- Weight: ${profile.weight ? `${profile.weight}kg` : 'not set'}${profile.goal_weight ? ` (goal: ${profile.goal_weight}kg)` : ''}
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

  const systemPrompt = `You are Sage, a warm and encouraging wellness coach for MindfulBite. Write a personal weekly wellness narrative for the user based on their actual data.

Respond with ONLY markdown text (no JSON, no code fences). Structure it as a few short, readable paragraphs:
- Open with a warm, personal greeting that names how the week felt overall.
- A short paragraph on **nutrition** (calories vs goal, protein, consistency of logging).
- A short paragraph on **mood** (dominant mood, patterns, how often they checked in).
- A short paragraph on **sleep** (duration vs the 7-9h ideal, quality, consistency).
- End with exactly one clearly-labelled **win** from this week and one **focus for next week**.

Reference their real numbers. Be honest but never alarmist or clinical. Keep the whole report concise — aim for under 250 words. If a data area has no entries, gently encourage logging it rather than inventing numbers.`

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
    const report = data.content?.find((c) => c.type === 'text')?.text ?? ''

    return new Response(JSON.stringify({ report }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Weekly report generation error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to generate report', details: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
