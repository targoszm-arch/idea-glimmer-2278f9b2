alter table public.brand_tracker_runs
  add column if not exists position_in_list integer;

alter table public.brand_tracker_runs
  drop constraint if exists brand_tracker_runs_provider_check;
alter table public.brand_tracker_runs
  add constraint brand_tracker_runs_provider_check
  check (provider in ('chatgpt', 'claude', 'perplexity', 'gemini', 'grok'));
