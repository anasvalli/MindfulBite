// Vercel Edge Function — receives normalized wearable data from an aggregator
// (e.g. self-hosted Open Wearables) and writes it into Supabase. Also auto-fills
// sleep_logs so the Sleep screen reflects device data without manual entry.
//
// Provider-agnostic: the aggregator should POST a normalized payload (see below).
// Secured with a shared secret (WEARABLE_WEBHOOK_SECRET).

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ebnamzpofmlhlnzgvkbe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const WEBHOOK_SECRET = process.env.WEARABLE_WEBHOOK_SECRET ?? ''

interface WearablePayload {
  user_id: string          // MindfulBite user id (passed through as reference_id)
  provider: string         // 'fitbit' | 'garmin' | 'oura' | ...
  date: string             // YYYY-MM-DD
  calories_burned?: number
  steps?: number
  active_minutes?: number
  resting_hr?: number
  hrv?: number
  sleep_minutes?: number
  sleep_quality?: number   // 1-5
  raw?: unknown
}

async function sb(method: string, path: string, body?: unknown, prefer?: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Auth: shared secret via header only — query params can leak into access logs.
  const provided = req.headers.get('x-webhook-secret') ?? ''
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Service not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: WearablePayload | WearablePayload[]
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const records = Array.isArray(payload) ? payload : [payload]
  const results: Array<{ user_id: string; date: string; ok: boolean }> = []

  for (const r of records) {
    if (!r.user_id || !r.date) {
      results.push({ user_id: r.user_id ?? '?', date: r.date ?? '?', ok: false })
      continue
    }
    try {
      // 1. Upsert the raw wearable_data row
      await sb('POST', 'wearable_data?on_conflict=user_id,date,source',
        {
          user_id: r.user_id,
          date: r.date,
          source: r.provider ?? 'wearable',
          calories_burned: r.calories_burned ?? null,
          steps: r.steps ?? null,
          active_minutes: r.active_minutes ?? null,
          resting_hr: r.resting_hr ?? null,
          hrv: r.hrv ?? null,
          sleep_minutes: r.sleep_minutes ?? null,
          sleep_quality: r.sleep_quality ?? null,
          raw_json: r.raw ?? null,
        },
        'resolution=merge-duplicates'
      )

      // 2. If sleep data present, mirror it into sleep_logs (device-sourced)
      if (r.sleep_minutes && r.sleep_minutes > 0) {
        await sb('POST', 'sleep_logs?on_conflict=user_id,date',
          {
            user_id: r.user_id,
            date: r.date,
            duration_minutes: r.sleep_minutes,
            quality_score: r.sleep_quality ?? null,
            notes: `Synced from ${r.provider ?? 'wearable'}`,
          },
          'resolution=merge-duplicates'
        )
      }

      // 3. Mark the connection's last_sync
      await sb('POST', 'wearable_connections?on_conflict=user_id,provider',
        {
          user_id: r.user_id,
          provider: r.provider ?? 'wearable',
          status: 'connected',
          last_sync: new Date().toISOString(),
        },
        'resolution=merge-duplicates'
      )

      results.push({ user_id: r.user_id, date: r.date, ok: true })
    } catch {
      results.push({ user_id: r.user_id, date: r.date, ok: false })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
