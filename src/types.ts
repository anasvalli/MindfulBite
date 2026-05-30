export interface User {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  age: number | null
  gender: string | null
  weight: number | null
  height: number | null
  bmi: number | null
  goal_weight: number | null
  daily_calorie_goal: number | null
  dietary_prefs: string | null
  wake_time: string | null
  sleep_time: string | null
  country: string | null
  city: string | null
  subscription_tier: 'Basic' | 'Premium'
  onboarding_complete?: boolean
  protein_goal?: number | null
  carbs_goal?: number | null
  fat_goal?: number | null
  created_at: string
}

export interface FoodItem {
  id: string
  name: string
  quantity: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Meal {
  id: string
  user_id: string
  image_url: string | null
  items_json: FoodItem[]
  total_calories: number
  macros_json: { protein: number; carbs: number; fat: number }
  created_at: string
}

export interface MealMood {
  id: string
  meal_id: string | null
  user_id: string
  mood: string
  context_notes: string | null
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}
