-- Originally applied on prod via direct SQL before migration tracking was
-- adopted. Reconstructed here so Supabase preview branches (and local
-- `supabase db reset`) can run all migrations from scratch without errors.
--
-- Uses IF NOT EXISTS throughout so this is a no-op on the live database
-- where the table already exists.

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

-- Users can only read/write their own integration rows.
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
