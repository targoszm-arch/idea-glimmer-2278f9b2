-- Organizations + team membership.
--
-- v1: single-workspace model. Every user belongs to exactly one org.
-- All content tables (articles, social_posts, ai_settings, brand_assets)
-- already have no user-scoped RLS — any authenticated user sees everything.
-- So this migration only adds the membership layer (invite, list, remove)
-- without touching content table schemas.

-- 1. Core tables --------------------------------------------------------

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

create policy "Members can read their org"
  on public.organizations for select
  using (
    id in (select org_id from public.organization_members where user_id = auth.uid())
    or owner_id = auth.uid()
  );

create policy "Owner can update org"
  on public.organizations for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


create table if not exists public.organization_members (
  org_id    uuid not null references public.organizations(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.organization_members enable row level security;

create policy "Members can read their org members"
  on public.organization_members for select
  using (
    org_id in (select org_id from public.organization_members om where om.user_id = auth.uid())
  );

create policy "Owner can manage members"
  on public.organization_members for all
  using (
    org_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );


create table if not exists public.organization_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  email      text not null,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  role       text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.organization_invites enable row level security;

create policy "Org members can read invites"
  on public.organization_invites for select
  using (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

create policy "Owner can manage invites"
  on public.organization_invites for all
  using (
    org_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );


-- 2. Backfill: create a personal org for every existing user -----------

insert into public.organizations (id, name, owner_id)
select
  gen_random_uuid(),
  coalesce(
    (select ai.newsletter_from_name from public.ai_settings ai limit 1),
    split_part(u.email, '@', 1)
  ),
  u.id
from auth.users u
where not exists (
  select 1 from public.organizations o where o.owner_id = u.id
);

insert into public.organization_members (org_id, user_id, role)
select o.id, o.owner_id, 'owner'
from public.organizations o
where not exists (
  select 1 from public.organization_members om
  where om.org_id = o.id and om.user_id = o.owner_id
);


-- 3. Auto-create org on new user signup --------------------------------
--    Also auto-accept any pending invite for the new user's email.

create or replace function public.handle_new_user_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row record;
  new_org_id uuid;
begin
  -- Check for a pending invite first.
  select * into invite_row
  from public.organization_invites
  where email = new.email
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_row is not null then
    -- Accept the invite: add user to that org.
    insert into public.organization_members (org_id, user_id, role)
    values (invite_row.org_id, new.id, invite_row.role)
    on conflict (org_id, user_id) do nothing;

    -- Clean up the invite.
    delete from public.organization_invites where id = invite_row.id;
  else
    -- No invite — create a personal org.
    new_org_id := gen_random_uuid();
    insert into public.organizations (id, name, owner_id)
    values (new_org_id, split_part(new.email, '@', 1), new.id);

    insert into public.organization_members (org_id, user_id, role)
    values (new_org_id, new.id, 'owner');
  end if;

  return new;
end;
$$;

-- Fire after insert on auth.users so every new signup gets an org.
drop trigger if exists on_auth_user_created_org on auth.users;
create trigger on_auth_user_created_org
  after insert on auth.users
  for each row
  execute function public.handle_new_user_org();
