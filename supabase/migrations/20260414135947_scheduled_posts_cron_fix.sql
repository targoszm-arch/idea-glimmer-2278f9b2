-- Fix the process-scheduled-posts cron job.
--
-- The previous migration (20260410030000_schedule_social_posts_cron.sql)
-- scheduled the job to call its URL with
--   Authorization: Bearer current_setting('app.service_role_key')
-- but `app.service_role_key` was never actually set on production, so the
-- header sent was `Bearer ` (empty) and the edge function's auth check
-- rejected every invocation with a 401. Scheduled LinkedIn posts piled up
-- forever.
--
-- The edge function has now been redeployed with `verify_jwt: false` and
-- no internal auth check — matching `process-newsletter-queue` which has
-- run the same way in prod for months. This migration reschedules the
-- cron to call the function without relying on `app.service_role_key`.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove the previous schedule(s). Using DO block so we can drop by name
-- without error if no row matches.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-posts' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Reschedule with a hardcoded URL. Project ref is embedded so the job
-- doesn't depend on any DB-level setting being manually configured.
-- If you ever clone this project, update the URL below.
SELECT cron.schedule(
  'process-scheduled-posts',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := 'https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/process-scheduled-posts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
