-- OAuth 2.1 infrastructure for MCP directory submission.
--
-- Three tables support the authorization_code + refresh_token grant flow,
-- with PKCE (S256) and RFC 7591 Dynamic Client Registration. All tables
-- live on the service role only — end users never read these directly;
-- the auth flow is driven entirely by edge functions running as admin.
--
-- See supabase/functions/mcp-oauth-{metadata,register,token}/ for the
-- corresponding endpoints.

-- Registered clients (created via DCR by Claude). client_id is a random
-- opaque string we generate; redirect_uris must exactly match what
-- Claude sent during registration.
create table if not exists oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

-- Short-lived authorization codes. Written by the consent screen when
-- the user approves, consumed once by the /token endpoint.
create table if not exists oauth_authorization_codes (
  code text primary key,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null,
  scope text,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists oauth_authorization_codes_user_idx
  on oauth_authorization_codes (user_id);

-- Opaque refresh tokens. Rotated on every use (see token endpoint).
create table if not exists oauth_refresh_tokens (
  token text primary key,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_refresh_tokens_user_idx
  on oauth_refresh_tokens (user_id);

-- RLS: service role only. No anon/authenticated access.
alter table oauth_clients enable row level security;
alter table oauth_authorization_codes enable row level security;
alter table oauth_refresh_tokens enable row level security;

-- No policies means no access — the service role bypasses RLS entirely,
-- so edge functions using the service role key still work.

-- Allow the consent screen (React app, running with the user's session)
-- to create authorization codes without needing to route through yet
-- another edge function. The function is SECURITY DEFINER so it can
-- write to oauth_authorization_codes, but it enforces:
--   1. The caller is an authenticated Supabase user (auth.uid() is set).
--   2. The client_id + redirect_uri pair matches a registered client.
--   3. code_challenge_method is S256 (OAuth 2.1 forbids `plain`).
create or replace function public.create_mcp_auth_code(
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_code_challenge_method text,
  p_scope text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_redirect_valid boolean;
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if p_code_challenge_method <> 'S256' then
    raise exception 'invalid_code_challenge_method';
  end if;

  if p_code_challenge is null or length(p_code_challenge) < 43 then
    raise exception 'invalid_code_challenge';
  end if;

  select exists (
    select 1 from oauth_clients
    where client_id = p_client_id
      and p_redirect_uri = any(redirect_uris)
  ) into v_redirect_valid;

  if not v_redirect_valid then
    raise exception 'invalid_client_or_redirect';
  end if;

  v_code := 'mcpa_' || encode(gen_random_bytes(32), 'hex');

  insert into oauth_authorization_codes (
    code, client_id, user_id, redirect_uri,
    code_challenge, code_challenge_method, scope, expires_at
  ) values (
    v_code, p_client_id, v_user, p_redirect_uri,
    p_code_challenge, p_code_challenge_method, coalesce(p_scope, 'mcp'),
    now() + interval '10 minutes'
  );

  return v_code;
end;
$$;

grant execute on function public.create_mcp_auth_code(text, text, text, text, text)
  to authenticated;

-- Mirror function to let the consent screen display the client's name
-- before the user approves (so it can say "Claude wants to connect" not
-- "mcpc_abc123... wants to connect"). Read-only, by-client_id only.
create or replace function public.get_mcp_client_for_consent(p_client_id text)
returns table (
  client_id text,
  client_name text,
  redirect_uris text[]
)
language sql
security definer
set search_path = public
as $$
  select client_id, client_name, redirect_uris
  from oauth_clients
  where client_id = p_client_id;
$$;

grant execute on function public.get_mcp_client_for_consent(text) to authenticated;
