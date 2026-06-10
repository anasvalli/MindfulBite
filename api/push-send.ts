// Vercel Serverless Function (Node runtime — web-push needs Node crypto for
// VAPID signing, so this is NOT an edge function).
//
// Sends the "morning brief" Web Push to every subscribed user: yesterday's
// calorie total + a nudge for the day. Triggered by api/patterns.ts at the end
// of its nightly cron (02:00 UTC ≈ 7:00 AM Pakistan) or manually with the
// CRON_SECRET bearer. Dead subscriptions (404/410) are pruned.

import webpush from 'web-push'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''

interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface UserRow {
  id: string
  full_name: string | null
  reminder_prefs: { morningBrief?: boolean } | null
}

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

export default async function handler(req: any, res: any) {
  // Auth: Vercel cron header or CRON_SECRET bearer — mirrors api/patterns.ts.
  const cronHeader = req.headers['x-vercel-cron']
  const authHeader = req.headers['authorization']
  const secret = process.env.CRON_SECRET
  const isVercelCron = cronHeader === '1'
  const isAuthorized = Boolean(secret && authHeader === `Bearer ${secret}`)
  if (!isVercelCron && !isAuthorized) {
    return res.status(401).send('Unauthorized')
  }
  if (!SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'Push not configured' })
  }

  webpush.setVapidDetails('mailto:hello@mindfulbite.app', VAPID_PUBLIC, VAPID_PRIVATE)

  // All subscriptions + their owners' prefs/names.
  const subsRes = await rest('push_subscriptions?select=id,user_id,endpoint,p256dh,auth')
  if (!subsRes.ok) return res.status(500).json({ error: 'Failed to load subscriptions' })
  const subs = (await subsRes.json()) as SubRow[]
  if (subs.length === 0) return res.status(200).json({ sent: 0, pruned: 0, skipped: 0 })

  const userIds = [...new Set(subs.map((s) => s.user_id))]
  const usersRes = await rest(
    `users?id=in.(${userIds.join(',')})&select=id,full_name,reminder_prefs`,
  )
  const users = usersRes.ok ? ((await usersRes.json()) as UserRow[]) : []
  const userById = new Map(users.map((u) => [u.id, u]))

  // Yesterday's calories per user (one query, bucketed by UTC day — close
  // enough for a brief; per-user timezones aren't stored).
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const yStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000)
  const mealsRes = await rest(
    `meals?user_id=in.(${userIds.join(',')})&created_at=gte.${yStart.toISOString()}&created_at=lt.${dayStart.toISOString()}&select=user_id,total_calories`,
  )
  const kcalByUser = new Map<string, number>()
  if (mealsRes.ok) {
    for (const m of (await mealsRes.json()) as Array<{ user_id: string; total_calories: number | null }>) {
      kcalByUser.set(m.user_id, (kcalByUser.get(m.user_id) ?? 0) + (m.total_calories ?? 0))
    }
  }

  let sent = 0
  let pruned = 0
  let skipped = 0

  await Promise.all(
    subs.map(async (sub) => {
      const u = userById.get(sub.user_id)
      // Opt-out respected; missing prefs default to sending (the toggle that
      // creates a subscription also sets morningBrief: true).
      if (u?.reminder_prefs && u.reminder_prefs.morningBrief === false) {
        skipped++
        return
      }
      const first = u?.full_name?.split(' ')[0]
      const yKcal = Math.round(kcalByUser.get(sub.user_id) ?? 0)
      const body =
        yKcal > 0
          ? `Yesterday: ${yKcal.toLocaleString()} kcal logged. Breakfast is coming up — let's make today count.`
          : `A fresh day is waiting. Snap your breakfast and Sage will take it from there.`
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: `Good morning${first ? `, ${first}` : ''} 🌿`, body, url: '/' }),
        )
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await rest(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' })
          pruned++
        }
      }
    }),
  )

  return res.status(200).json({ sent, pruned, skipped })
}
