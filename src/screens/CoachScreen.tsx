import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import type { ChatMessage, Meal, MealMood } from '../types'
import { IconClose, IconSend } from '../components/icons'
import { isAtChatLimit, incrementChatCount, remainingChats } from '../lib/chatLimits'

interface CoachScreenProps {
  go: (screen: string) => void
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

const CHIPS = [
  "What should I eat today?",
  "Analyse my week",
  "I'm feeling low energy",
  "Help me hit my protein goal",
]

type Personality = 'warm' | 'direct' | 'clinical'
const PERSONALITIES: { id: Personality; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'direct', label: 'Direct' },
  { id: 'clinical', label: 'Clinical' },
]
const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function CoachScreen({ go }: CoachScreenProps) {
  const { user, profile } = useAuth()
  const { lang, t } = useLanguage()
  const firstName = profile?.full_name?.split(' ')[0] ?? null

  // Detect mood-chat mode (set by CaptureScreen after mood-check)
  const isMoodChat = localStorage.getItem('coachMode') === 'mood'
  useEffect(() => {
    localStorage.removeItem('coachMode')
  }, [])

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: `Hi${firstName ? ` ${firstName}` : ''}! I'm Sage, your personal wellness coach. Ask me anything about your nutrition, sleep, or mood — I'll pull your real data to give you personalised guidance.`,
    },
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [userContext, setUserContext] = useState('')
  const [mealMoodCtx, setMealMoodCtx] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Voice input (Web Speech API)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Sage personality
  const [personality, setPersonality] = useState<Personality>(
    () => (localStorage.getItem('coachPersonality') as Personality) || 'warm'
  )
  const [personalityMenuOpen, setPersonalityMenuOpen] = useState(false)
  function selectPersonality(p: Personality) {
    setPersonality(p)
    localStorage.setItem('coachPersonality', p)
    setPersonalityMenuOpen(false)
  }

  function toggleListening() {
    if (!SR) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    try {
      const rec = new SR()
      rec.lang = lang === 'en' ? 'en-US' : lang
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript ?? ''
        if (transcript) setInput(transcript)
      }
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      recognitionRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
    }
  }, [])

  const tier = profile?.subscription_tier ?? 'Basic'

  // Detect and consume meal+mood context from localStorage
  useEffect(() => {
    const raw = localStorage.getItem('mealMoodContext')
    if (raw) {
      try {
        const ctx = JSON.parse(raw) as {
          mealName: string
          calories: number
          mood: string
          protein: number
          carbs: number
          fat: number
          timestamp: number
        }
        if (Date.now() - ctx.timestamp < 10 * 60 * 1000) {
          setMessages([{
            role: 'assistant',
            text: `You just had ${ctx.mealName} (${ctx.calories} kcal · P${Math.round(ctx.protein)}g · C${Math.round(ctx.carbs)}g · F${Math.round(ctx.fat)}g) and you're feeling ${ctx.mood}. That combination tells me a lot — let's talk about it. What's going on?`,
          }])
          setMealMoodCtx(
            `Just logged: ${ctx.mealName} (${ctx.calories} kcal). Post-meal mood: ${ctx.mood}. Macros: protein ${Math.round(ctx.protein)}g, carbs ${Math.round(ctx.carbs)}g, fat ${Math.round(ctx.fat)}g.`
          )
        }
        localStorage.removeItem('mealMoodContext')
      } catch {
        // ignore parse errors
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return

    async function buildContext() {
      try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const [mealsRes, moodsRes] = await Promise.all([
          supabase
            .from('meals')
            .select('total_calories, macros_json, created_at')
            .eq('user_id', user!.id)
            .gte('created_at', sevenDaysAgo.toISOString()),
          supabase
            .from('meal_moods')
            .select('mood, context_notes, created_at')
            .eq('user_id', user!.id)
            .gte('created_at', sevenDaysAgo.toISOString()),
        ])

        const meals = (mealsRes.data ?? []) as Meal[]
        const moods = (moodsRes.data ?? []) as MealMood[]

        // Group meals by calendar day first
        const calByDay = new Map<string, number>()
        meals.forEach((m) => {
          const day = new Date(m.created_at).toISOString().split('T')[0] ?? ''
          calByDay.set(day, (calByDay.get(day) ?? 0) + (m.total_calories ?? 0))
        })
        const avgCalories = calByDay.size > 0
          ? Array.from(calByDay.values()).reduce((a, b) => a + b, 0) / calByDay.size
          : 0

        const moodSummary = moods.map((m) => m.mood).join(', ') || 'none logged'

        const ctx = [
          `User: ${profile?.full_name ?? 'Unknown'}`,
          `Goal: ${profile?.daily_calorie_goal ?? 2150} kcal/day`,
          `Protein target: ${profile?.protein_goal ?? 'not set'}g/day`,
          `Carbs target: ${profile?.carbs_goal ?? 'not set'}g/day`,
          `Fat target: ${profile?.fat_goal ?? 'not set'}g/day`,
          `Weight: ${profile?.weight ?? 'not set'}kg → Goal: ${profile?.goal_weight ?? 'not set'}kg`,
          `Dietary preferences: ${profile?.dietary_prefs ?? 'none specified'}`,
          `Avg daily calories (last 7 days): ${Math.round(avgCalories)} kcal`,
          `Meals logged this week: ${meals.length}`,
          `Recent moods: ${moodSummary}`,
        ].join('\n')

        setUserContext(ctx)
      } catch (err) {
        console.warn('CoachScreen context build error:', err)
      }
    }

    buildContext()
  }, [user, profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  async function sendMessage(text: string) {
    if (!text.trim() || isThinking) return

    // Check daily chat limit (mood chats bypass the limit)
    if (!isMoodChat && isAtChatLimit(tier)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `You've used your 8 free AI chats for today. Come back tomorrow, or upgrade to Premium for unlimited conversations with Sage. 🌿`,
      }])
      return
    }

    const userMsg: ChatMessage = { role: 'user', text: text.trim() }
    const history = [...messages]
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const baseContext = mealMoodCtx ? `${mealMoodCtx}\n\n${userContext}` : userContext
      const langInstruction = lang !== 'en' ? `IMPORTANT: Respond in the user's language (${lang}).\n\n` : ''
      const combinedContext = langInstruction + baseContext
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ message: text.trim(), history, userContext: combinedContext, personality }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json() as { reply: string }
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply }])

      // Increment count only for non-mood chats
      if (!isMoodChat) {
        incrementChatCount()
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "I'm having a little trouble connecting right now. Please try again in a moment!",
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
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
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '56px 20px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: 'var(--accent-wash)',
            border: '1px solid var(--accent-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🌿
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: 'var(--text-dim)',
              marginBottom: 2,
            }}
          >
            AI WELLNESS COACH
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            Sage
          </div>
          {/* Remaining chats counter (only for free users, not on mood chats) */}
          {!isMoodChat && tier !== 'Premium' && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              {remainingChats(tier) === Infinity ? '' : `${remainingChats(tier)} chats left today`}
            </div>
          )}
        </div>

        {/* Personality picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setPersonalityMenuOpen((o) => !o)}
            style={{
              background: 'var(--accent-wash)',
              border: '1px solid var(--accent-line)',
              borderRadius: 100,
              padding: '6px 12px',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'var(--sans)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Tone: {PERSONALITIES.find((p) => p.id === personality)?.label}
          </button>
          {personalityMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 20,
                minWidth: 120,
                boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              }}
            >
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPersonality(p.id)}
                  style={{
                    background: p.id === personality ? 'var(--accent-wash)' : 'none',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 12px',
                    color: p.id === personality ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 13,
                    fontFamily: 'var(--sans)',
                    fontWeight: p.id === personality ? 600 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => go('home')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 8,
          }}
        >
          <IconClose size={20} />
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Prompt chips (only show if just initial message) */}
        {messages.length === 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 100,
                  padding: '8px 14px',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  background: 'var(--accent-wash)',
                  border: '1px solid var(--accent-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  marginRight: 8,
                  marginTop: 4,
                }}
              >
                🌿
              </div>
            )}
            <div
              style={{
                maxWidth: '78%',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                color: msg.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding: '12px 16px',
                fontSize: 14,
                lineHeight: 1.55,
                border: msg.role === 'assistant' ? '1px solid var(--line)' : 'none',
              }}
            >
              {renderMarkdown(msg.text)}
            </div>
          </div>
        ))}

        {/* Thinking dots */}
        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                background: 'var(--accent-wash)',
                border: '1px solid var(--accent-line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              🌿
            </div>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '18px 18px 18px 4px',
                padding: '12px 16px',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="mb-dot"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px 16px 36px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexShrink: 0,
          background: 'var(--bg)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('coach.placeholder')}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            padding: '12px 18px',
            color: 'var(--text)',
            fontFamily: 'var(--sans)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        {SR && (
          <button
            onClick={toggleListening}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: listening ? 'var(--accent)' : 'var(--surface)',
              border: `1px solid ${listening ? 'var(--accent-line)' : 'var(--line)'}`,
              color: listening ? 'var(--on-accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
              animation: listening ? 'mb-pulse 1.2s ease-in-out infinite' : undefined,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
        )}
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isThinking}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: input.trim() && !isThinking ? 'var(--accent)' : 'var(--surface)',
            border: '1px solid var(--line)',
            color: input.trim() && !isThinking ? 'var(--on-accent)' : 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
        >
          <IconSend size={18} />
        </button>
      </div>
    </div>
  )
}
