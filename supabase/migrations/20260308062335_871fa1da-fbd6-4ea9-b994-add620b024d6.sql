
create table public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  tone_key text not null default 'informative',
  tone_label text not null default 'Informative',
  tone_description text not null default '',
  app_description text not null default '',
  app_audience text not null default '',
  reference_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_settings enable row level security;
create policy "Allow all access to ai_settings" on public.ai_settings for all using (true) with check (true);

-- Insert default row
insert into public.ai_settings (tone_key, tone_label, tone_description, app_description, app_audience)
values ('informative', 'Informative', 'The writer obtains information through extensive research and experience, and they don''t include personal opinions. The tone is neutral, and the language is clear and concise. The writer uses facts, statistics, and examples to support their points.', '', '');
