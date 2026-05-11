alter table public.brand_tracker_config
  add column if not exists owned_domains jsonb not null default '[]'::jsonb,
  add column if not exists competitor_domains jsonb not null default '{}'::jsonb;
