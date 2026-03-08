
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  content text not null default '',
  excerpt text not null default '',
  meta_description text not null default '',
  category text not null default 'General',
  status text not null default 'draft',
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;
create policy "Allow all access to articles" on public.articles for all using (true) with check (true);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title_suggestion text not null,
  strategy text not null default 'TOFU',
  category text not null default 'General',
  status text not null default 'unused',
  created_at timestamptz not null default now()
);

alter table public.content_ideas enable row level security;
create policy "Allow all access to content_ideas" on public.content_ideas for all using (true) with check (true);
