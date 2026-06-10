import { parseTime12h } from './time'
import { supabase } from './supabase'

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function isNotificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

interface PlanMeal { type: string; name: string; time: string }

// Schedule notifications for today's meal plan using setTimeout (works while tab is open)
let scheduledTimers: number[] = []

export function scheduleMealReminders(plan: PlanMeal[]): void {
  // Clear existing
  scheduledTimers.forEach(t => clearTimeout(t))
  scheduledTimers = []
  if (!isNotificationsEnabled()) return

  const now = new Date()
  plan.forEach(meal => {
    const time = parseTime12h(meal.time)
    if (!time) return
    const msUntil = time.getTime() - now.getTime()
    if (msUntil > 0 && msUntil < 24 * 60 * 60 * 1000) {
      const timer = window.setTimeout(() => {
        new Notification(`🍽️ Time for ${meal.type}`, {
          body: meal.name,
          icon: '/icon.png',
        })
      }, msUntil)
      scheduledTimers.push(timer)
    }
  })
}

// ---------------------------------------------------------------------------
// Richer reminders engine
// ---------------------------------------------------------------------------

export interface ReminderPrefs {
  meals: boolean
  water: boolean
  windDown: boolean
  morningBrief?: boolean
}

const REMINDER_PREFS_KEY = 'reminderPrefs'

export function getReminderPrefs(): ReminderPrefs {
  const fallback: ReminderPrefs = { meals: false, water: false, windDown: false, morningBrief: false }
  try {
    const raw = localStorage.getItem(REMINDER_PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      meals: !!parsed?.meals,
      water: !!parsed?.water,
      windDown: !!parsed?.windDown,
      morningBrief: !!parsed?.morningBrief,
    }
  } catch {
    return fallback
  }
}

// localStorage is the synchronous cache; users.reminder_prefs (jsonb) is the
// durable copy so prefs survive reinstalls and drive server-side push.
export function setReminderPrefs(prefs: ReminderPrefs, userId?: string): void {
  try {
    localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore storage failures */
  }
  if (userId) {
    supabase
      .from('users')
      .update({ reminder_prefs: prefs })
      .eq('id', userId)
      .then(() => {}, () => {})
  }
}

// Pull the durable copy into the local cache (call once after sign-in).
export async function syncReminderPrefs(userId: string): Promise<ReminderPrefs> {
  try {
    const { data } = await supabase.from('users').select('reminder_prefs').eq('id', userId).single()
    const remote = (data as { reminder_prefs?: ReminderPrefs | null } | null)?.reminder_prefs
    if (remote && typeof remote === 'object') {
      localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(remote))
      return getReminderPrefs()
    }
  } catch {
    /* offline — keep cache */
  }
  return getReminderPrefs()
}

// ─── Web Push ────────────────────────────────────────────────────────────────
// True background notifications via the PWA service worker — the setTimeout
// reminders above only fire while a tab is open.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

export async function subscribePush(userId: string): Promise<boolean> {
  try {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
    if (Notification.permission !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }))
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    )
    return !error
  } catch {
    return false
  }
}

export async function unsubscribePush(userId: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
  } catch {
    /* best effort */
  }
}

// Module-level timers for the rich scheduler (kept separate from meal-only timers above).
let reminderTimers: number[] = []

// Parse a time string into a Date for today. Accepts "7:00 AM" style strings;
// falls back to a default time-of-day (24h) when parsing fails.
function timeForToday(timeStr: string | null | undefined, defaultHour: number, defaultMin = 0): Date {
  if (timeStr) {
    const parsed = parseTime12h(timeStr)
    if (parsed) return parsed
  }
  const d = new Date()
  d.setHours(defaultHour, defaultMin, 0, 0)
  return d
}

function scheduleAt(when: Date, title: string, body: string): void {
  const msUntil = when.getTime() - Date.now()
  if (msUntil > 0 && msUntil < 24 * 60 * 60 * 1000) {
    const timer = window.setTimeout(() => {
      new Notification(title, { body, icon: '/icon.png' })
    }, msUntil)
    reminderTimers.push(timer)
  }
}

export function scheduleAllReminders(opts: {
  wakeTime?: string | null
  sleepTime?: string | null
  mealPlan?: any[] | null
  prefs: ReminderPrefs
}): void {
  // Clear previously scheduled timers from this scheduler.
  reminderTimers.forEach(t => clearTimeout(t))
  reminderTimers = []
  if (!isNotificationsEnabled()) return

  const { wakeTime, sleepTime, mealPlan, prefs } = opts

  // --- Meals ---
  if (prefs.meals) {
    if (Array.isArray(mealPlan) && mealPlan.length > 0) {
      mealPlan.forEach((meal: any) => {
        const t = parseTime12h(meal?.time ?? '')
        if (!t) return
        const label = meal?.type || meal?.name || 'your meal'
        scheduleAt(t, `🍽️ Time for ${label}`, 'log it in MindfulBite')
      })
    } else {
      const defaults: Array<{ label: string; hour: number; min: number }> = [
        { label: 'breakfast', hour: 8, min: 0 },
        { label: 'lunch', hour: 13, min: 0 },
        { label: 'dinner', hour: 19, min: 30 },
      ]
      defaults.forEach(({ label, hour, min }) => {
        const d = new Date()
        d.setHours(hour, min, 0, 0)
        scheduleAt(d, `🍽️ Time for ${label}`, 'log it in MindfulBite')
      })
    }
  }

  // --- Water: every 3 hours between wake and sleep ---
  if (prefs.water) {
    const wake = timeForToday(wakeTime, 8, 0)
    const sleep = timeForToday(sleepTime, 23, 0)
    const start = new Date(wake)
    while (start.getTime() <= sleep.getTime()) {
      scheduleAt(new Date(start), '💧 Hydration check', 'have a glass of water')
      start.setHours(start.getHours() + 3)
    }
  }

  // --- Wind-down: 45 min before sleep ---
  if (prefs.windDown) {
    const sleep = timeForToday(sleepTime, 23, 0)
    const windDown = new Date(sleep.getTime() - 45 * 60 * 1000)
    scheduleAt(
      windDown,
      '🌙 Wind-down time',
      "a calm evening helps tomorrow's energy",
    )
  }
}

// ─── Contextual permission ask ───────────────────────────────────────────────
// Ask for notification permission at a meaningful moment (right after the
// user's first successful meal log) instead of a buried Settings toggle.
// Asks at most once; safe to call repeatedly.
const PERM_ASKED_KEY = 'notifPermAsked'

export async function maybeAskNotificationPermission(userId?: string): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') {
      if (userId) void subscribePush(userId)
      return true
    }
    if (Notification.permission === 'denied') return false
    if (localStorage.getItem(PERM_ASKED_KEY)) return false
    localStorage.setItem(PERM_ASKED_KEY, '1')
    const result = await Notification.requestPermission()
    const granted = result === 'granted'
    // Permission granted in a meaningful moment → also register for real
    // background push so reminders work with the app closed.
    if (granted && userId) void subscribePush(userId)
    return granted
  } catch {
    return false
  }
}
