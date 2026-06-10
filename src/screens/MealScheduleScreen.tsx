import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui'
import { IconChevL } from '../components/icons'

interface MealScheduleScreenProps {
  go: (screen: string) => void
}

function to24h(t: string | null | undefined): string {
  if (!t) return ''
  // Already 24h "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0')
  // 12h "H:MM AM/PM"
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return ''
  let h = parseInt(m[1]); const min = m[2]; const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

function eatingWindow(wake: string, sleep: string): string {
  const w = wake.match(/^(\d{1,2}):(\d{2})$/)
  const s = sleep.match(/^(\d{1,2}):(\d{2})$/)
  if (!w || !s) return '—'
  const wakeMin = parseInt(w[1]) * 60 + parseInt(w[2])
  let sleepMin = parseInt(s[1]) * 60 + parseInt(s[2])
  // Handle crossing midnight (sleep earlier than wake)
  if (sleepMin <= wakeMin) sleepMin += 24 * 60
  const diff = sleepMin - wakeMin
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return `${h}h ${m}m`
}

export function MealScheduleScreen({ go }: MealScheduleScreenProps) {
  const { user, profile, refreshProfile } = useAuth()
  const [wakeTime, setWakeTime] = useState(to24h(profile?.wake_time) || '07:00')
  const [sleepTime, setSleepTime] = useState(to24h(profile?.sleep_time) || '23:00')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('users').update({ wake_time: wakeTime, sleep_time: sleepTime }).eq('id', user.id)
      await refreshProfile()
      go('settings')
    } finally {
      setSaving(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  }

  const timeInputStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '11px 14px',
    fontFamily: 'var(--mono)',
    fontSize: 17,
    color: 'var(--text)',
    outline: 'none',
    colorScheme: 'dark',
  }

  return (
    <div
      className="mb-screen"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '56px 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => go('settings')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
        >
          <IconChevL size={20} />
        </button>
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}
        >
          Daily Schedule
        </h2>
      </div>

      <div style={{ padding: '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          Set your wake and sleep times so Sage can time your meal plan.
        </p>

        {/* Wake */}
        <Card>
          <div style={cardStyle}>
            <span style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
              🌅 Wake up
            </span>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              style={timeInputStyle}
            />
          </div>
        </Card>

        {/* Sleep */}
        <Card>
          <div style={cardStyle}>
            <span style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
              🌙 Sleep
            </span>
            <input
              type="time"
              value={sleepTime}
              onChange={(e) => setSleepTime(e.target.value)}
              style={timeInputStyle}
            />
          </div>
        </Card>

        {/* Eating window note */}
        <p
          style={{
            fontSize: 13,
            color: 'var(--accent)',
            fontFamily: 'var(--mono)',
            textAlign: 'center',
            margin: '4px 0',
          }}
        >
          Your eating window: {eatingWindow(wakeTime, sleepTime)}
        </p>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            height: 52,
            background: saving ? 'var(--accent-wash)' : 'var(--accent)',
            color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
            border: 'none',
            borderRadius: 14,
            fontFamily: 'var(--sans)',
            fontSize: 15,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
        >
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </div>
  )
}
