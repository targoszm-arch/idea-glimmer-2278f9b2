-- Atomic claim helper for the process-newsletter-queue cron worker.
--
-- Before this RPC, the worker did SELECT … status='scheduled' LIMIT 10
-- followed by a per-row UPDATE inside a JS for loop. Two concurrent cron
-- runs (the scheduled run + a manual invocation, say) would both see the
-- same row as 'scheduled' and both try to send it. The send-newsletter
-- function's `if status='sent' return 400` check is a backstop, but it
-- only fires AFTER both runs have already started touching state.
--
-- This RPC claims up to N due rows in one statement using
-- FOR UPDATE SKIP LOCKED, flips them to 'sending', and returns them.
-- A second concurrent caller skips the locked rows entirely.

-- Defensive: ensure newsletter_schedules exists before we reference it as
-- a return type. Supabase Preview builds the schema declaratively and
-- sometimes skips prior-migration content changes, which left this RPC
-- failing with "type public.newsletter_schedules does not exist". The
-- CREATE TABLE IF NOT EXISTS is a no-op on prod and on any preview that
-- already ran 20260328031155_newsletter_scheduling.
CREATE TABLE IF NOT EXISTS public.newsletter_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid,
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

create or replace function public.claim_due_newsletters(p_limit int default 10)
returns setof public.newsletter_schedules
language sql
volatile
security definer
set search_path = public
as $$
  update public.newsletter_schedules
     set status = 'sending', updated_at = now()
   where id in (
     select id
       from public.newsletter_schedules
      where status = 'scheduled'
        and scheduled_at <= now()
      order by scheduled_at
      for update skip locked
      limit greatest(p_limit, 1)
   )
  returning *;
$$;

-- Restrict to service role — only edge functions running with the
-- service-role JWT should claim queued newsletters.
revoke all on function public.claim_due_newsletters(int) from public;
revoke all on function public.claim_due_newsletters(int) from anon, authenticated;
grant execute on function public.claim_due_newsletters(int) to service_role;
