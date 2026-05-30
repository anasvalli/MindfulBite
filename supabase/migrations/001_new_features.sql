-- ============================================================
-- MindfulBite: New Features Migration
-- File: 001_new_features.sql
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================


-- ============================================================
-- 1. sleep_logs
--    Tracks nightly sleep manually entered by the user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,                   -- the night date (e.g. 2025-05-30)
  bedtime TIME,                         -- e.g. 23:00
  wake_time TIME,                       -- e.g. 07:00
  duration_minutes INTEGER,            -- total sleep in minutes
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),  -- 1=terrible, 5=excellent
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique: one log per user per night
CREATE UNIQUE INDEX IF NOT EXISTS sleep_logs_user_date ON public.sleep_logs (user_id, date);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sleep"
  ON public.sleep_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 2. mood_checkins
--    Rich standalone mood check-ins, separate from meal_moods.
--    meal_moods stays in place for per-meal mood tracking.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mood TEXT NOT NULL,                   -- Radiant, Calm, Tired, Tense, Low
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  context TEXT,                         -- 'pre_meal' | 'post_meal' | 'standalone'
  meal_id UUID REFERENCES public.meals(id) ON DELETE SET NULL,  -- nullable
  notes TEXT,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mood checkins"
  ON public.mood_checkins
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 3. ai_user_model
--    Stores AI-extracted behavioural patterns for personalised
--    coaching. One row per user; upserted by the AI service.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_user_model (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  patterns JSONB DEFAULT '[]'::jsonb,   -- [{type, description, confidence, observed_at}, ...]
  food_quality_score NUMERIC,          -- 1-10 rolling weekly score
  mood_stability_score NUMERIC,        -- 1-10 rolling weekly score
  sleep_debt_hours NUMERIC,            -- hours below target this week
  last_extracted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.ai_user_model ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own model"
  ON public.ai_user_model
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can write model"
  ON public.ai_user_model
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 4. clinical_reports
--    Weekly AI-generated clinical summary reports.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clinical_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  food_score NUMERIC,
  mood_score NUMERIC,
  sleep_score NUMERIC,
  overall_score NUMERIC,
  recommendations JSONB DEFAULT '[]'::jsonb,  -- [{title, body, priority}, ...]
  summary TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS reports_user_week ON public.clinical_reports (user_id, week_start);

ALTER TABLE public.clinical_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reports"
  ON public.clinical_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service writes reports"
  ON public.clinical_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 5. Add onboarding_complete to users
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;


-- ============================================================
-- 6. Update users insert policy (more permissive for service role)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id OR id IS NOT NULL);
