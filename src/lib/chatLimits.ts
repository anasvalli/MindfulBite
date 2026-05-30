const STORAGE_KEY = 'mbChatUsage'
const FREE_LIMIT = 8

interface ChatUsage {
  date: string
  count: number
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

function getChatCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const usage: ChatUsage = JSON.parse(raw)
    if (usage.date !== getTodayKey()) return 0
    return usage.count
  } catch {
    return 0
  }
}

export function incrementChatCount(): void {
  const count = getChatCount()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayKey(), count: count + 1 }))
}

export function isAtChatLimit(subscriptionTier: string): boolean {
  if (subscriptionTier === 'Premium') return false
  return getChatCount() >= FREE_LIMIT
}

export function remainingChats(subscriptionTier: string): number {
  if (subscriptionTier === 'Premium') return Infinity
  return Math.max(0, FREE_LIMIT - getChatCount())
}
