import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Card, Eyebrow, Spinner } from '../components/ui'
import { IconChevL, IconCheck } from '../components/icons'
import { MOOD_HUES, MOOD_EMOJIS } from '../lib/moods'

interface TodayCheckin {
  mood: string
  intensity: number | null
  logged_at: string
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

interface MoodScreenProps {
  go: (screen: string) => void
}

interface MoodCheckin {
  id: string
  user_id: string
  mood: string
  intensity: number
  context: string
  meal_id: string | null
  notes: string | null
  logged_at: string
}

interface MoodOption {
  label: string
  emoji: string
  hue: number
}

const MOODS: MoodOption[] = [
  { label: 'Radiant', emoji: '☀️', hue: 85 },
  { label: 'Calm',    emoji: '🍃', hue: 150 },
  { label: 'Tired',   emoji: '🌙', hue: 250 },
  { label: 'Tense',   emoji: '🌀', hue: 30 },
  { label: 'Low',     emoji: '🌧️', hue: 260 },
]

const CONTEXTS = [
  { key: 'pre_meal',   label: 'Pre-meal' },
  { key: 'post_meal',  label: 'Post-meal' },
  { key: 'standalone', label: 'Just checking in' },
]

const INTENSITY_LABELS = ['Faint', 'Mild', 'Moderate', 'Strong', 'Vivid']

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getMoodHue(moodLabel: string): number {
  return MOODS.find((m) => m.label === moodLabel)?.hue ?? 85
}

function getMoodEmoji(moodLabel: string): string {
  return MOODS.find((m) => m.label === moodLabel)?.emoji ?? ''
}

export function MoodScreen({ go }: MoodScreenProps) {
  const { user } = useAuth()

  // Form state
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [selectedContext, setSelectedContext] = useState<string>('standalone')
  const [selectedIntensity, setSelectedIntensity] = useState<number>(3)
  const [formNotes, setFormNotes] = useState('')

  // UI state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ribbon state
  const [ribbonData, setRibbonData] = useState<MoodCheckin[]>([])
  const [ribbonLoading, setRibbonLoading] = useState(true)

  // Today's check-ins (timeline + count)
  const [todayCount, setTodayCount] = useState(0)
  const [todayCheckins, setTodayCheckins] = useState<TodayCheckin[]>([])

  async function loadTodayCount() {
    if (!user) return
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('mood_checkins')
      .select('mood, intensity, logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', startOfDay.toISOString())
      .order('logged_at', { ascending: false })
    setTodayCheckins((data ?? []) as TodayCheckin[])
    setTodayCount(data?.length ?? 0)
  }

  // Build the 7-day ribbon columns (Mon through today's day-of-week, last 7 days)
  const ribbonDays = (() => {
    // Build a map of date -> latest checkin (data is ascending, last write wins)
    // and a count of how many check-ins occurred that day.
    const byDate = new Map<string, MoodCheckin>()
    const countByDate = new Map<string, number>()
    ribbonData.forEach((c) => {
      const day = c.logged_at.split('T')[0] ?? ''
      byDate.set(day, c)
      countByDate.set(day, (countByDate.get(day) ?? 0) + 1)
    })

    const days: Array<{ dayInit: string; date: string; checkin: MoodCheckin | null; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0] ?? ''
      // day of week: 0=Sun..6=Sat → map to M T W T F S S (Mon first)
      const dow = d.getDay() // 0=Sun
      const initIndex = dow === 0 ? 6 : dow - 1
      const dayInit = DAY_INITIALS[initIndex] ?? ''
      const checkin = byDate.get(dateStr) ?? null
      const count = countByDate.get(dateStr) ?? 0
      days.push({ dayInit, date: dateStr, checkin, count })
    }
    return days
  })()

  useEffect(() => {
    if (!user) return
    async function loadRibbon() {
      try {
        const sevenDays = new Date()
        sevenDays.setDate(sevenDays.getDate() - 6)
        const { data, error: err } = await supabase
          .from('mood_checkins')
          .select('*')
          .eq('user_id', user!.id)
          .gte('logged_at', sevenDays.toISOString())
          .order('logged_at', { ascending: true })

        if (err) {
          // Table may not exist yet — gracefully show empty ribbon
          console.warn('mood_checkins fetch error (table may not exist yet):', err.message)
          setRibbonData([])
        } else {
          setRibbonData((data ?? []) as MoodCheckin[])
        }
      } catch (err) {
        console.warn('Ribbon load failed:', err)
        setRibbonData([])
      } finally {
        setRibbonLoading(false)
      }
    }
    loadRibbon()
    loadTodayCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function resetForm() {
    setSelectedMood(null)
    setSelectedContext('standalone')
    setSelectedIntensity(3)
    setFormNotes('')
    setError(null)
  }

  async function handleSave() {
    if (!user || !selectedMood) return
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('mood_checkins').insert({
        user_id: user.id,
        mood: selectedMood,
        intensity: selectedIntensity,
        context: selectedContext,
        meal_id: null,
        notes: formNotes.trim() || null,
        logged_at: new Date().toISOString(),
      })
      if (err) throw new Error(err.message)

      // Optimistically add to ribbon
      const newEntry: MoodCheckin = {
        id: Date.now().toString(),
        user_id: user.id,
        mood: selectedMood,
        intensity: selectedIntensity,
        context: selectedContext,
        meal_id: null,
        notes: formNotes.trim() || null,
        logged_at: new Date().toISOString(),
      }
      setRibbonData((prev) => [...prev, newEntry])

      // Refresh today's count + timeline so the user sees the new entry.
      await loadTodayCount()

      setSaved(true)
      // Show success briefly, then reset so they can immediately log another.
      setTimeout(() => {
        setSaved(false)
        resetForm()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save check-in')
    } finally {
      setSaving(false)
    }
  }

  const selectedMoodObj = MOODS.find((m) => m.label === selectedMood) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => go('home')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <IconChevL size={20} />
        </button>
        <h2
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Mood
        </h2>
        {/* Spacer to keep the title centered (removed non-functional clock icon) */}
        <div style={{ width: 28 }} />
      </div>

      {/* Prompt */}
      <div>
        <h3
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 26,
            fontWeight: 500,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            margin: '0 0 6px',
            lineHeight: 1.25,
            whiteSpace: 'pre-line',
          }}
        >
          {'How are you,\nreally?'}
        </h3>
        <p
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 13,
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Track how you feel to spot patterns with your food and sleep.
        </p>
        {todayCount > 0 && (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              margin: '8px 0 0',
            }}
          >
            ✓ You've checked in {todayCount} time{todayCount === 1 ? '' : 's'} today
          </p>
        )}
      </div>

      {/* 5 Mood buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        {MOODS.map((mood) => {
          const isSelected = selectedMood === mood.label
          return (
            <button
              key={mood.label}
              onClick={() => {
                setSelectedMood(mood.label)
                setSaved(false)
              }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '12px 4px',
                borderRadius: 14,
                border: isSelected
                  ? `1px solid oklch(0.78 0.09 ${mood.hue})`
                  : '1px solid var(--line)',
                background: isSelected
                  ? `oklch(0.78 0.09 ${mood.hue} / 0.12)`
                  : 'var(--surface)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <span style={{ fontSize: 24 }}>{mood.emoji}</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--sans)',
                  fontWeight: 600,
                  color: isSelected
                    ? `oklch(0.82 0.08 ${mood.hue})`
                    : 'var(--text-muted)',
                  transition: 'color 0.18s ease',
                }}
              >
                {mood.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Detail card — animates in when a mood is selected */}
      {selectedMoodObj && (
        <Card style={{ animation: 'mb-fade 280ms ease both' }}>
          {/* Context chips */}
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>Context</Eyebrow>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {CONTEXTS.map(({ key, label }) => {
              const sel = selectedContext === key
              return (
                <button
                  key={key}
                  onClick={() => setSelectedContext(key)}
                  style={{
                    padding: '7px 13px',
                    borderRadius: 22,
                    border: sel ? '1px solid var(--accent-line)' : '1px solid var(--line)',
                    background: sel ? 'var(--accent-wash)' : 'var(--surface-2)',
                    color: sel ? 'var(--accent)' : 'var(--text-muted)',
                    fontFamily: 'var(--sans)',
                    fontSize: 12,
                    fontWeight: sel ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Intensity slider */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <Eyebrow>How intense?</Eyebrow>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 15,
                fontWeight: 500,
                color: `oklch(0.78 0.09 ${selectedMoodObj.hue})`,
              }}
            >
              {INTENSITY_LABELS[selectedIntensity - 1]}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={selectedIntensity}
            onChange={(e) => setSelectedIntensity(Number(e.target.value))}
            style={{ width: '100%', marginBottom: 16, accentColor: 'var(--accent)' }}
          />

          {/* Notes */}
          <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Notes (optional)</Eyebrow>
          <textarea
            rows={2}
            placeholder="What's on your mind?"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '10px 14px',
              fontFamily: 'var(--sans)',
              fontSize: 13,
              color: 'var(--text)',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
        </Card>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'oklch(0.65 0.18 25 / 0.12)',
            border: '1px solid oklch(0.65 0.18 25 / 0.3)',
            borderRadius: 14,
            padding: '12px 16px',
            fontFamily: 'var(--sans)',
            fontSize: 13,
            color: 'oklch(0.60 0.20 25)',
          }}
        >
          {error}
        </div>
      )}

      {/* Save button */}
      {selectedMood && (
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            width: '100%',
            height: 52,
            background: saved
              ? 'oklch(0.72 0.14 150)'
              : saving
              ? 'var(--accent-wash)'
              : 'var(--accent)',
            color: saved ? '#fff' : saving ? 'var(--text-dim)' : 'var(--on-accent)',
            border: 'none',
            borderRadius: 14,
            fontFamily: 'var(--sans)',
            fontSize: 15,
            fontWeight: 700,
            cursor: saving || saved ? 'not-allowed' : 'pointer',
            transition: 'all 0.25s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {saved ? (
            <>
              <IconCheck size={18} />
              Saved!
            </>
          ) : saving ? (
            <Spinner size={20} />
          ) : (
            'Save Check-in'
          )}
        </button>
      )}

      {/* Today's check-ins timeline */}
      {todayCheckins.length > 0 && (
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 12 }}>Today's check-ins</Eyebrow>
          <Card pad="6px 16px">
            {todayCheckins.map((c, idx) => {
              const hue = MOOD_HUES[c.mood] ?? 85
              const emoji = MOOD_EMOJIS[c.mood] ?? ''
              const intensity = c.intensity ?? 0
              return (
                <div
                  key={`${c.logged_at}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  {/* Emoji bubble */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: `oklch(0.78 0.09 ${hue} / 0.18)`,
                      border: `1px solid oklch(0.78 0.09 ${hue} / 0.40)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {emoji}
                  </div>
                  {/* Mood name */}
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text)',
                      flex: 1,
                    }}
                  >
                    {c.mood}
                  </span>
                  {/* Intensity dots */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background:
                            n <= intensity
                              ? `oklch(0.78 0.09 ${hue})`
                              : 'var(--line)',
                        }}
                      />
                    ))}
                  </div>
                  {/* Time */}
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: 'var(--text-dim)',
                      flexShrink: 0,
                      minWidth: 62,
                      textAlign: 'right',
                    }}
                  >
                    {formatTime(c.logged_at)}
                  </span>
                </div>
              )
            })}
          </Card>
        </div>
      )}

      {/* This week's ribbon */}
      <div style={{ paddingBottom: 16 }}>
        <Eyebrow style={{ display: 'block', marginBottom: 12 }}>This Week</Eyebrow>
        {ribbonLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spinner size={28} />
          </div>
        ) : (
          <Card pad="14px 16px">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {ribbonDays.map(({ dayInit, date, checkin, count }, idx) => {
                const hue = checkin ? getMoodHue(checkin.mood) : null
                const emoji = checkin ? getMoodEmoji(checkin.mood) : null
                return (
                  <div
                    key={`${date}-${idx}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: hue !== null
                          ? `oklch(0.78 0.09 ${hue} / 0.18)`
                          : 'var(--surface-2)',
                        border: `1px solid ${hue !== null ? `oklch(0.78 0.09 ${hue} / 0.40)` : 'var(--line)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {emoji ?? ''}
                      {count > 1 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -5,
                            right: -5,
                            minWidth: 14,
                            height: 14,
                            padding: '0 3px',
                            boxSizing: 'border-box',
                            borderRadius: 7,
                            background: 'var(--accent)',
                            color: 'var(--on-accent)',
                            fontFamily: 'var(--mono)',
                            fontSize: 9,
                            fontWeight: 700,
                            lineHeight: '14px',
                            textAlign: 'center',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--mono)',
                      }}
                    >
                      {dayInit}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
