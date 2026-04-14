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
