-- The create_user_integrations migration (20260319045814) was an empty stub
-- because the table was created directly on prod before migration tracking.
-- Supabase preview branches never ran the DDL, so any migration that ALTERs
-- user_integrations fails with "relation does not exist".
--
-- This migration creates the table if it doesn't already exist, making
-- preview branches match the live schema. All clauses are IF NOT EXISTS
-- so this is a no-op on the live database.

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_user_id text,
  platform_user_name text,
  access_token text NOT NULL DEFAULT '',
  refresh_token text,
  token_expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_integrations_user_id_idx
  ON public.user_integrations (user_id);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_integrations'
      AND policyname = 'Users can manage their own integrations'
  ) THEN
    CREATE POLICY "Users can manage their own integrations"
      ON public.user_integrations
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;
