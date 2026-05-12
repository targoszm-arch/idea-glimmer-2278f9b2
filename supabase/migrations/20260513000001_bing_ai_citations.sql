create table if not exists public.bing_ai_citations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_url text not null,
  query text,
  page_url text,
  impressions integer not null default 0,
  clicks integer not null default 0,
  position numeric,
  period_start date,
  period_end date,
  ai_source text,
  fetched_at timestamptz not null default now()
);
create index if not exists bing_ai_citations_user_idx on public.bing_ai_citations(user_id, fetched_at desc);
create index if not exists bing_ai_citations_query_idx on public.bing_ai_citations(user_id, query);
alter table public.bing_ai_citations enable row level security;
create policy "users read own bing citations" on public.bing_ai_citations for select using (auth.uid() = user_id);
