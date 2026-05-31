import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Card, Eyebrow, Spinner } from '../components/ui'
import { IconChevL, IconPlus } from '../components/icons'
import { scheduleMealReminders, isNotificationsEnabled } from '../lib/notifications'

interface MealPlanScreenProps {
  go: (screen: string) => void
}

interface MealPlanItem {
  type: 'breakfast' | 'lunch' | 'snacks' | 'dinner'
  name: string
  calories: number
  emoji: string
  time: string
  protein?: number
  carbs?: number
  fat?: number
}

const MEAL_PLAN_KEY = 'mealPlan'

export function MealPlanScreen({ go }: MealPlanScreenProps) {
  const { profile, user } = useAuth()
  const [plan, setPlan] = useState<MealPlanItem[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toastItem, setToastItem] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  // Load saved plan from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEAL_PLAN_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MealPlanItem[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlan(parsed)
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  async function generatePlan() {
    setGenerating(true)
    setError(null)

    const prefs = profile?.dietary_prefs ?? 'None'
    const goal = profile?.daily_calorie_goal ?? 2150
    const cuisine = profile?.cuisine_pref ?? 'no specific preference'
    const weightGoal =
      profile?.goal_weight && profile?.weight
        ? profile.goal_weight < profile.weight
          ? 'lose weight'
          : profile.goal_weight > profile.weight
          ? 'gain muscle'
          : 'maintain weight'
        : 'maintain weight'

    const message = `Generate a 1-day meal plan for me. My cuisine preference is ${cuisine}. Make all meals authentic to ${cuisine} cuisine.
My profile: ${prefs} diet, ${goal} kcal daily goal, goal: ${weightGoal}.
Return ONLY a JSON array, no text before or after:
[
  {"type":"breakfast","name":"meal name","calories":N,"emoji":"🍳","time":"8:00 AM","protein":N,"carbs":N,"fat":N},
  {"type":"lunch","name":"meal name","calories":N,"emoji":"🥗","time":"1:00 PM","protein":N,"carbs":N,"fat":N},
  {"type":"snacks","name":"meal name","calories":N,"emoji":"🍎","time":"4:00 PM","protein":N,"carbs":N,"fat":N},
  {"type":"dinner","name":"meal name","calories":N,"emoji":"🍽️","time":"7:30 PM","protein":N,"carbs":N,"fat":N}
]
Make meals culturally appropriate for my diet preferences. Total should be close to ${goal} kcal.`

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: [],
          userContext: `User dietary preferences: ${prefs}. Calorie goal: ${goal} kcal. Cuisine preference: ${cuisine}.`,
          userId: user?.id,
        }),
      })

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`)
      }

      const data = await res.json() as { reply: string; error?: string }

      if (data.error) {
        throw new Error(data.error)
      }

      const match = data.reply.match(/\[[\s\S]*\]/)
      if (!match) {
        throw new Error('Invalid response format — could not parse meal plan.')
      }

      const items = JSON.parse(match[0]) as MealPlanItem[]

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Empty meal plan returned.')
      }

      setPlan(items)
      localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(items))
      if (isNotificationsEnabled()) scheduleMealReminders(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  async function logMealFromPlan(item: MealPlanItem) {
    if (!user) return
    try {
      await supabase.from('meals').insert({
        user_id: user.id,
        image_url: null,
        items_json: [
          {
            id: `plan-${Date.now()}`,
            name: item.name,
            quantity: '1 serving',
            calories: item.calories,
            protein: item.protein ?? 0,
            carbs: item.carbs ?? 0,
            fat: item.fat ?? 0,
          },
        ],
        total_calories: item.calories,
        macros_json: {
          protein: item.protein ?? 0,
          carbs: item.carbs ?? 0,
          fat: item.fat ?? 0,
        },
        created_at: new Date().toISOString(),
      })
      setToastItem(item.name)
      setTimeout(() => setToastItem(null), 2200)
    } catch (err) {
      console.warn('Log meal error:', err)
    }
  }

  const totalCalories = plan ? plan.reduce((s, m) => s + m.calories, 0) : 0
  const calorieGoal = profile?.daily_calorie_goal ?? 2150
  const calorieDiff = totalCalories - calorieGoal

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
          justifyContent: 'space-between',
          flexShrink: 0,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => go('home')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
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
            }}
          >
            Meal Plan
          </h2>
        </div>
      </div>

      <div style={{ padding: '0 20px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Generate / Regenerate button */}
        <button
          onClick={generatePlan}
          disabled={generating}
          style={{
            width: '100%',
            height: 52,
            background: generating ? 'var(--accent-wash)' : 'var(--accent)',
            color: generating ? 'var(--accent)' : 'var(--on-accent)',
            border: generating ? '1px solid var(--accent-line)' : 'none',
            borderRadius: 18,
            fontFamily: 'var(--sans)',
            fontSize: 15,
            fontWeight: 700,
            cursor: generating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'background 0.2s',
            letterSpacing: '0.01em',
            flexShrink: 0,
          }}
        >
          {generating ? (
            <>
              <Spinner size={18} />
              <span>Crafting your plan with Sage…</span>
            </>
          ) : plan ? (
            '↻ Regenerate Plan'
          ) : (
            '✦ Generate Today\'s Plan'
          )}
        </button>

        {/* Calorie summary card */}
        {plan && !generating && (
          <Card pad="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Eyebrow style={{ display: 'block', marginBottom: 4 }}>Planned Today</Eyebrow>
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 26,
                    fontWeight: 500,
                    color: 'var(--text)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {totalCalories.toLocaleString()}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginLeft: 5 }}>
                  kcal
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
                  Goal: {calorieGoal.toLocaleString()} kcal
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    color: Math.abs(calorieDiff) < 100
                      ? 'var(--accent)'
                      : calorieDiff > 0
                      ? 'oklch(0.70 0.14 30)'
                      : 'oklch(0.72 0.14 85)',
                  }}
                >
                  {calorieDiff > 0 ? `+${calorieDiff}` : calorieDiff} kcal
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Error state */}
        {error && (
          <Card
            pad="16px 18px"
            style={{
              background: 'oklch(0.20 0.04 20)',
              borderColor: 'oklch(0.40 0.12 20)',
            }}
          >
            <p style={{ fontSize: 13, color: 'oklch(0.78 0.14 25)', marginBottom: 12, lineHeight: 1.5 }}>
              {error}
            </p>
            <button
              onClick={generatePlan}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 12,
                padding: '10px 20px',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </Card>
        )}

        {/* Empty state */}
        {!plan && !generating && !error && (
          <Card style={{ textAlign: 'center', padding: '28px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🍽️</div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 20,
                color: 'var(--text)',
                marginBottom: 8,
              }}
            >
              No plan yet
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Tap Generate to get a personalised daily meal plan from Sage based on your dietary preferences and calorie goal.
            </p>
          </Card>
        )}

        {/* Loading skeleton */}
        {generating && !plan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} pad={16} style={{ opacity: 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      background: 'var(--surface-2)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 10,
                        background: 'var(--surface-2)',
                        borderRadius: 6,
                        marginBottom: 8,
                        width: '40%',
                      }}
                    />
                    <div
                      style={{
                        height: 14,
                        background: 'var(--surface-2)',
                        borderRadius: 6,
                        width: '70%',
                      }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Meal cards */}
        {plan && !generating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plan.map((item, idx) => (
              <Card key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Emoji tile */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: 'var(--surface-2)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  {item.emoji}
                </div>

                {/* Info — tap to expand the full meal name + macros */}
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                        fontFamily: 'var(--sans)',
                      }}
                    >
                      {item.type}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🕐 {item.time}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 14.5,
                      color: 'var(--text)',
                      whiteSpace: expandedIdx === idx ? 'normal' : 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.35,
                    }}
                  >
                    {item.name}
                  </div>
                  {item.protein != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                      P{item.protein}g · C{item.carbs ?? 0}g · F{item.fat ?? 0}g
                    </div>
                  )}
                  {expandedIdx !== idx && (
                    <div style={{ fontSize: 10.5, color: 'var(--accent)', marginTop: 4 }}>Tap for details</div>
                  )}
                </div>

                {/* Calories + Log button */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontFamily: 'var(--sans)',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.calories}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>kcal</div>
                  </div>

                  {/* Log button */}
                  <button
                    onClick={() => logMealFromPlan(item)}
                    title="Log this meal"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--on-accent)',
                      flexShrink: 0,
                    }}
                  >
                    <IconPlus size={16} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Regenerate hint */}
        {plan && !generating && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              textAlign: 'center',
            }}
          >
            Tap + to log a meal · Regenerate for a fresh plan
          </p>
        )}
      </div>

      {/* Toast notification — anchored to top of outermost positioned div, always visible */}
      {toastItem && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'oklch(0.55 0.15 150)',
            color: '#fff',
            fontFamily: 'var(--sans)',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 100,
            padding: '10px 20px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          ✓ Logged!
        </div>
      )}
    </div>
  )
}
