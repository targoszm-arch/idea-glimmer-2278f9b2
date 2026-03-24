-- Table to store allowed HeyGen template IDs
CREATE TABLE IF NOT EXISTS public.heygen_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL UNIQUE,
  name text,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Public read so the edge function can query without auth
ALTER TABLE public.heygen_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read heygen_templates" ON public.heygen_templates
  FOR SELECT USING (true);

-- Only service role can insert/update/delete (managed by you in dashboard)
