-- Supabase Database Schema for MindfulBite
-- This file reflects the actual live database structure.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  age INTEGER,
  gender TEXT,
  weight NUMERIC,
  height NUMERIC,
  bmi NUMERIC,
  goal_weight NUMERIC,
  daily_calorie_goal NUMERIC,
  dietary_prefs TEXT,
  wake_time TEXT,
  sleep_time TEXT,
  country TEXT,
  city TEXT,
  subscription_tier TEXT DEFAULT 'Basic',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MEALS TABLE
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  image_url TEXT,
  items_json JSONB,
  total_calories NUMERIC,
  macros_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MEAL MOODS TABLE
CREATE TABLE IF NOT EXISTS public.meal_moods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id UUID REFERENCES public.meals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  mood TEXT NOT NULL,
  context_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) Setup
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_moods ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own profile
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to manage their own meals
CREATE POLICY "Users can view own meals" ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meals" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON public.meals FOR DELETE USING (auth.uid() = user_id);

-- Allow users to manage their own meal_moods
CREATE POLICY "Users can view own moods" ON public.meal_moods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own moods" ON public.meal_moods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own moods" ON public.meal_moods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own moods" ON public.meal_moods FOR DELETE USING (auth.uid() = user_id);

-- Function to delete a user's account and all associated data
-- Called via supabase.rpc('delete_user_account') from the app
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.meal_moods WHERE user_id = auth.uid();
  DELETE FROM public.meals WHERE user_id = auth.uid();
  DELETE FROM public.users WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
