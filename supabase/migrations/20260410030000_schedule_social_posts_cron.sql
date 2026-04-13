-- pg_cron job to invoke the process-scheduled-posts edge function every minute.
-- Requires Supabase Pro (pg_cron + pg_net extensions).
--
-- Before applying, set these two settings so the job can authenticate:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<service role key>';
-- Then reconnect and re-run this migration.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any previous schedule with the same name
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'process-scheduled-posts';

SELECT cron.schedule(
  'process-scheduled-posts',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/process-scheduled-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
