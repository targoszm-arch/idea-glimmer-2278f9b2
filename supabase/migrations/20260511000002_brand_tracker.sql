create table if not exists public.brand_tracker_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  brand_name text,
  brand_url text,
  brand_aliases jsonb not null default '[]'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  prompts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.brand_tracker_config enable row level security;
create policy "own brand config" on public.brand_tracker_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.brand_tracker_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  provider text not null,
  model text,
  response_text text,
  mentions_brand boolean not null default false,
  brand_position integer,
  mentions_competitors jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  tokens_used integer,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists brand_tracker_runs_user_idx
  on public.brand_tracker_runs(user_id, created_at desc);
create index if not exists brand_tracker_runs_provider_idx
  on public.brand_tracker_runs(user_id, provider, created_at desc);
alter table public.brand_tracker_runs enable row level security;
create policy "own brand runs" on public.brand_tracker_runs
  for select using (auth.uid() = user_id);
