# MindfulBite — Supabase Backend Setup

## Running the Migration

1. Open your Supabase project dashboard.
2. Go to **SQL Editor** → **New query**.
3. Open `supabase/migrations/001_new_features.sql`, copy the entire contents, paste into the editor, and click **Run**.
4. Confirm there are no errors. All tables, indexes, and RLS policies will be created idempotently (`IF NOT EXISTS` / `IF EXISTS` guards throughout).

---

## Tables Added

| Table | Purpose |
|---|---|
| `sleep_logs` | One row per user per night. Stores bedtime, wake time, total duration, and a 1–5 quality score. Unique index on `(user_id, date)` prevents duplicate entries. |
| `mood_checkins` | Standalone mood snapshots (Radiant / Calm / Tired / Tense / Low) with optional intensity, context (`pre_meal`, `post_meal`, `standalone`), and an optional link to a meal. Separate from the existing `meal_moods` table. |
| `ai_user_model` | One row per user. Holds AI-extracted behavioural patterns (JSONB array), rolling weekly scores for food quality, mood stability, and sleep debt. Written by the AI service; users can only read their own row. |
| `clinical_reports` | Weekly AI-generated clinical summaries with per-dimension scores, a free-text summary, and a JSONB array of prioritised recommendations. Unique index on `(user_id, week_start)`. Users can only read their own reports. |

Column `onboarding_complete BOOLEAN DEFAULT FALSE` has also been added to the existing `users` table.

---

## Storage Bucket

The `meal-images` bucket must be created **manually** in Supabase Storage:

1. Go to **Storage** in your project dashboard.
2. Click **New bucket**, name it `meal-images`.
3. Toggle **Public bucket** on (so image URLs are publicly readable).
4. Click **Save**.

No additional bucket policies are needed for public read access once the bucket is set to public.
