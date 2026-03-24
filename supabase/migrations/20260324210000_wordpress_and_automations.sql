-- WordPress columns on articles
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS wp_post_id integer;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS wp_permalink text;

-- Automations table
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  cron_expression text NOT NULL,
  next_run_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  generate_mode text NOT NULL CHECK (generate_mode IN ('ideas_queue', 'custom_prompt')),
  funnel_stage_filter text CHECK (funnel_stage_filter IN ('all','TOFU','MOFU','BOFU')),
  category text,
  tone text,
  article_length text CHECK (article_length IN ('short','medium','long')) DEFAULT 'medium',
  improve_seo boolean DEFAULT false,
  custom_prompt text,
  prompt_variables jsonb DEFAULT '{}'::jsonb,
  publish_destinations text[] DEFAULT '{}',
  notify_email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_automations" ON public.automations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_automations_user_id ON public.automations(user_id);
CREATE INDEX idx_automations_next_run ON public.automations(next_run_at) WHERE is_active = true;

-- Automation runs table
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id),
  run_at timestamptz DEFAULT now(),
  status text CHECK (status IN ('success','failed')),
  error_message text,
  resolved_prompt text
);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read_automation_runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (automation_id IN (SELECT id FROM public.automations WHERE user_id = auth.uid()));
CREATE INDEX idx_automation_runs_automation_id ON public.automation_runs(automation_id);
