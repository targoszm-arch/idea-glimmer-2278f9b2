-- Several early migrations were applied directly to prod and left as empty
-- stubs. Preview branches run all migrations from scratch so these columns
-- never get added, causing later ALTER TABLE / CREATE INDEX statements to
-- fail. This migration ensures all columns and tables exist before the
-- April 2026 non-stub migrations run.
-- Every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this
-- is a complete no-op on the live database.

-- ── articles ─────────────────────────────────────────────────────────────
-- user_id is referenced by indexes in 20260430000001_rss_publish_at
-- and by RLS policies; the other columns were added by stub migrations.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notion_page_id text,
  ADD COLUMN IF NOT EXISTS shopify_article_id text,
  ADD COLUMN IF NOT EXISTS wp_post_id integer,
  ADD COLUMN IF NOT EXISTS wp_permalink text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS automation_name text,
  ADD COLUMN IF NOT EXISTS article_meta jsonb,
  ADD COLUMN IF NOT EXISTS newsletter_data jsonb;

CREATE INDEX IF NOT EXISTS articles_user_id_idx
  ON public.articles (user_id);

-- ── api_keys ─────────────────────────────────────────────────────────────
-- 20260323000000_create_api_keys was a stub.
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Default',
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx
  ON public.api_keys (user_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Users manage their own api_keys') THEN
    CREATE POLICY "Users manage their own api_keys"
      ON public.api_keys FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- ── user_credits ─────────────────────────────────────────────────────────
-- Ensure stripe columns exist (stub 20260323190000_add_stripe_customer_id).
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_status text,
  ADD COLUMN IF NOT EXISTS plan_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;

-- ── social_posts ─────────────────────────────────────────────────────────
-- Stub 20260326041443 was supposed to add scheduling columns, but the
-- non-stub 20260413034147 already uses ADD COLUMN IF NOT EXISTS, so this
-- is belt-and-suspenders for any earlier references.
-- (no additional columns needed beyond what 20260413034147 adds with IF NOT EXISTS)

-- ── canva_designs ────────────────────────────────────────────────────────
-- 20260325234908_create_canva_designs_table was a stub.
CREATE TABLE IF NOT EXISTS public.canva_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  image_url text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.canva_designs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canva_designs' AND policyname = 'Users manage their own canva_designs') THEN
    CREATE POLICY "Users manage their own canva_designs"
      ON public.canva_designs FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- ── heygen_templates ─────────────────────────────────────────────────────
-- 20260324200000_create_heygen_templates was a stub.
CREATE TABLE IF NOT EXISTS public.heygen_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL UNIQUE,
  name text,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer,
  created_at timestamptz DEFAULT now()
);

-- ── linkedin_connections ─────────────────────────────────────────────────
-- 20260331003439_create_linkedin_connections was a stub.
CREATE TABLE IF NOT EXISTS public.linkedin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_id text,
  access_token text NOT NULL DEFAULT '',
  refresh_token text,
  token_expires_at timestamptz,
  display_name text,
  profile_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'linkedin_connections' AND policyname = 'Users manage their own linkedin_connections') THEN
    CREATE POLICY "Users manage their own linkedin_connections"
      ON public.linkedin_connections FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- ── newsletter tables ────────────────────────────────────────────────────
-- Various newsletter stubs (20260328*). newsletter_schedules is already
-- created by 20260328031155 (non-stub) and 20260414110924 uses IF NOT EXISTS.
-- newsletter_contacts may be missing.
CREATE TABLE IF NOT EXISTS public.newsletter_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  subscribed boolean NOT NULL DEFAULT true,
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.newsletter_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_contacts' AND policyname = 'Users manage their own newsletter_contacts') THEN
    CREATE POLICY "Users manage their own newsletter_contacts"
      ON public.newsletter_contacts FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- ── automations ──────────────────────────────────────────────────────────
-- 20260324210000_wordpress_and_automations was a stub.
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  is_active boolean DEFAULT true,
  cron_expression text NOT NULL DEFAULT '0 9 * * 1',
  next_run_at timestamptz NOT NULL DEFAULT now(),
  timezone text NOT NULL DEFAULT 'UTC',
  generate_mode text NOT NULL DEFAULT 'topic',
  category text,
  tone text,
  article_length text,
  custom_prompt text,
  prompt_variables jsonb,
  notify_email text,
  publish_destinations text[],
  improve_seo boolean,
  funnel_stage_filter text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automations' AND policyname = 'Users manage their own automations') THEN
    CREATE POLICY "Users manage their own automations"
      ON public.automations FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  resolved_prompt text,
  error_message text,
  run_at timestamptz DEFAULT now()
);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
