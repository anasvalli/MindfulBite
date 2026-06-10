import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { WearableConnection, WearableData } from '../types'
import { Card, Eyebrow, Spinner } from '../components/ui'
import { IconChevL, IconCheck } from '../components/icons'

interface WearablesScreenProps {
  go: (screen: string) => void
}

// Supported providers. `web` = connectable directly from the browser via the
// aggregator widget; `native` = requires the mobile app (Apple Health / Health Connect).
const PROVIDERS: { key: string; label: string; emoji: string; web: boolean }[] = [
  { key: 'fitbit', label: 'Fitbit', emoji: '⌚', web: true },
  { key: 'oura', label: 'Oura Ring', emoji: '💍', web: true },
  { key: 'garmin', label: 'Garmin', emoji: '🏃', web: true },
  { key: 'whoop', label: 'Whoop', emoji: '🎽', web: true },
  { key: 'polar', label: 'Polar', emoji: '❄️', web: true },
  { key: 'strava', label: 'Strava', emoji: '🚴', web: true },
  { key: 'samsung', label: 'Samsung Health', emoji: '📱', web: false },
  { key: 'apple', label: 'Apple Health', emoji: '🍎', web: false },
  { key: 'google', label: 'Google Fit', emoji: '🤖', web: false },
]

// The aggregator (self-hosted Open Wearables) connect-widget base URL.
// Set VITE_WEARABLE_CONNECT_URL once the backend is hosted. Until then the
// UI shows a "coming soon" state instead of a broken link.
const CONNECT_URL = (import.meta.env['VITE_WEARABLE_CONNECT_URL'] as string) || ''

export function WearablesScreen({ go }: WearablesScreenProps) {
  const { user } = useAuth()
  const [connections, setConnections] = useState<WearableConnection[]>([])
  const [latest, setLatest] = useState<WearableData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const [connRes, dataRes] = await Promise.allSettled([
          supabase.from('wearable_connections').select('*').eq('user_id', user!.id),
          supabase
            .from('wearable_data')
            .select('*')
            .eq('user_id', user!.id)
            .order('date', { ascending: false })
            .limit(1),
        ])
        if (connRes.status === 'fulfilled' && connRes.value.data) {
          setConnections(connRes.value.data as WearableConnection[])
        }
        if (dataRes.status === 'fulfilled' && dataRes.value.data && dataRes.value.data.length > 0) {
          setLatest(dataRes.value.data[0] as WearableData)
        }
      } catch {
        /* tables may not exist yet — show empty state */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const connectedKeys = new Set(connections.map((c) => c.provider))
  const configured = CONNECT_URL.length > 0

  function connect(providerKey: string) {
    if (!configured || !user) return
    // Open Wearables widget; pass our user id as the reference so the webhook
    // can map data back to this user.
    const u = new URL(CONNECT_URL)
    u.searchParams.set('reference_id', user.id)
    u.searchParams.set('providers', providerKey)
    window.open(u.toString(), '_blank')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mb-screen" style={{ padding: '56px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => go('settings')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <IconChevL size={20} />
        </button>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, color: 'var(--text)' }}>
          Connect a device
        </div>
      </div>

      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: -8 }}>
        Sync sleep, calories burned, steps, and heart rate automatically from your wearable. Pick whichever device you own.
      </p>

      {/* Latest synced summary */}
      {latest && (
        <Card style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Last synced · {latest.date}</Eyebrow>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {latest.calories_burned != null && <Metric label="Burned" value={`${Math.round(latest.calories_burned)} kcal`} />}
            {latest.steps != null && <Metric label="Steps" value={`${latest.steps}`} />}
            {latest.sleep_minutes != null && <Metric label="Sleep" value={`${Math.floor(latest.sleep_minutes / 60)}h ${latest.sleep_minutes % 60}m`} />}
            {latest.resting_hr != null && <Metric label="Rest HR" value={`${latest.resting_hr} bpm`} />}
          </div>
        </Card>
      )}

      {/* Not-configured notice */}
      {!configured && (
        <Card style={{ textAlign: 'center', padding: '20px 18px' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🔌</div>
          <div style={{ fontSize: 14, fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: 6 }}>
            Wearable sync is being set up
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Device connections will be available here shortly. You can still log sleep and mood manually in the meantime.
          </p>
        </Card>
      )}

      {/* Provider list */}
      <div>
        <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Available devices</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PROVIDERS.map((p) => {
            const connected = connectedKeys.has(p.key)
            return (
              <div
                key={p.key}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{p.label}</div>
                  {!p.web && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Requires the mobile app</div>
                  )}
                </div>
                {connected ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                    <IconCheck size={14} /> Connected
                  </span>
                ) : p.web ? (
                  <button
                    onClick={() => connect(p.key)}
                    disabled={!configured}
                    style={{
                      background: configured ? 'var(--accent)' : 'var(--surface-2)',
                      color: configured ? 'var(--on-accent)' : 'var(--text-dim)',
                      border: 'none',
                      borderRadius: 10,
                      padding: '7px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'var(--sans)',
                      cursor: configured ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Connect
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>App only</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}
