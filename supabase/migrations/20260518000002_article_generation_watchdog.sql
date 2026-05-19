-- Article-generation watchdog.
--
-- create_article dispatches generation to a dedicated worker invocation.
-- If an edge isolate is still evicted mid-stream, the articles row would
-- stay in generation_status='generating' forever (silent empty article,
-- credits not refunded). This watchdog is the durability backstop: any
-- row stuck 'generating' past the worker's max runtime is reconciled to
-- 'failed' and the 5 generation credits are refunded.
--
-- generation_started_at: created_at is wrong for regenerated rows (the
-- row was created long ago), so the watchdog measures from a dedicated
-- timestamp stamped when the worker (re)starts. Falls back to created_at
-- for rows predating this column.

alter table articles add column if not exists generation_started_at timestamptz;

create or replace function public.reconcile_stuck_article_generations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, user_id
    from articles
    where generation_status = 'generating'
      and coalesce(generation_started_at, created_at) < now() - interval '10 minutes'
  loop
    update articles
      set generation_status = 'failed',
          generation_error = 'Generation timed out — worker did not complete within 10 minutes (auto-reconciled by watchdog).'
      where id = r.id;
    perform public.deduct_credits(r.user_id, -5, 'generate_article_refund_timeout');
    n := n + 1;
  end loop;
  if n > 0 then
    raise log 'reconcile_stuck_article_generations: reconciled % stuck article(s)', n;
  end if;
  return n;
end;
$function$;

-- Run every minute. cron.schedule is idempotent on job name.
select cron.schedule(
  'reconcile-stuck-article-generations',
  '* * * * *',
  $$select public.reconcile_stuck_article_generations()$$
);
