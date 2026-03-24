-- Enable pg_cron extension (requires Supabase Pro or above)
-- Run this manually if on Pro plan:
-- SELECT cron.schedule('run-automations', '* * * * *', $$
--   SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/run-automations',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb,
--     body := '{}'::jsonb
--   )
-- $$);

-- For now, automations are triggered manually or via external cron
-- Add updated_at trigger to automations
CREATE OR REPLACE FUNCTION update_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION update_automations_updated_at();
