-- Create newsletter_schedules + newsletter_contacts + newsletter_events.
-- These tables already exist on production (added via Supabase dashboard
-- before the migration CLI workflow was adopted). This file recreates
-- them with IF NOT EXISTS so fresh Supabase Preview branch builds can
-- rebuild the schema and so later migrations (claim_due_newsletters RPC
-- etc.) don't fail with "relation does not exist".

CREATE TABLE IF NOT EXISTS public.newsletter_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  subject_line text NOT NULL,
  preview_text text,
  html_content text NOT NULL,
  from_name text NOT NULL DEFAULT 'ContentLab',
  from_email text NOT NULL,
  reply_to text,
  audience_type text NOT NULL DEFAULT 'contacts',
  resend_audience_id text,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  recipient_count integer DEFAULT 0,
  error_message text,
  cta_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.newsletter_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own schedules" ON public.newsletter_schedules
    FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own schedules" ON public.newsletter_schedules
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS newsletter_schedules_user_idx ON public.newsletter_schedules (user_id);
CREATE INDEX IF NOT EXISTS newsletter_schedules_due_idx  ON public.newsletter_schedules (status, scheduled_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS public.newsletter_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  unsubscribed boolean DEFAULT false,
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.newsletter_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own contacts" ON public.newsletter_contacts
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS newsletter_contacts_user_idx ON public.newsletter_contacts (user_id);

CREATE TABLE IF NOT EXISTS public.newsletter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.newsletter_schedules(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_email text NOT NULL,
  event_type text NOT NULL,
  link_url text,
  occurred_at timestamptz DEFAULT now(),
  ip text,
  user_agent text
);

ALTER TABLE public.newsletter_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own events" ON public.newsletter_events
    FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS newsletter_events_schedule_idx ON public.newsletter_events (schedule_id);
