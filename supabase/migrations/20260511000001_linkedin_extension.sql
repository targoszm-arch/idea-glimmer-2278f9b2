-- LinkedIn browser-extension sync: per-user API tokens + snapshot store.

create table if not exists public.linkedin_extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists linkedin_extension_tokens_user_idx
  on public.linkedin_extension_tokens(user_id);

alter table public.linkedin_extension_tokens enable row level security;
create policy "users manage own tokens"
  on public.linkedin_extension_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.linkedin_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('profile', 'company')),
  company_id text,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
create unique index if not exists linkedin_snapshots_unique_idx
  on public.linkedin_snapshots(user_id, kind, coalesce(company_id, ''));
create index if not exists linkedin_snapshots_user_idx
  on public.linkedin_snapshots(user_id, kind);

alter table public.linkedin_snapshots enable row level security;
create policy "users read own snapshots"
  on public.linkedin_snapshots
  for select using (auth.uid() = user_id);
