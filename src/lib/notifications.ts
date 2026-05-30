import { parseTime12h } from './time'

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

