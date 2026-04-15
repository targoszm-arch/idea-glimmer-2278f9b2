-- MCP audit log + per-user rate limiting.
--
-- Two tables:
--   1. mcp_tool_invocations — one row per MCP tool call. Required by
--      Anthropic directory policy ("performance requirements",
--      "rate limiting is vendor's responsibility") and useful for
--      debugging runaway agents.
--   2. mcp_rate_limits — per-user override for the default hourly cap.
--      Blank by default; only populated when we want to raise or
--      lower the limit for a specific account.

create table if not exists mcp_tool_invocations (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  auth_method text not null check (auth_method in ('api_key', 'oauth', 'jwt')),
  client_id text,                 -- OAuth client_id when auth_method='oauth'
  arguments jsonb,                -- redacted: never stores tokens or passwords
  status text not null check (status in ('ok', 'error', 'rate_limited')),
  error_code int,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tool_invocations_user_time_idx
  on mcp_tool_invocations (user_id, created_at desc);

create index if not exists mcp_tool_invocations_created_idx
  on mcp_tool_invocations (created_at desc);

create table if not exists mcp_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hourly_limit int not null check (hourly_limit >= 0),
  updated_at timestamptz not null default now()
);

-- Service role only. The edge function writes these; end users never
-- read them directly (they'd go through a future /mcp/activity endpoint
-- if we want to surface the log in the UI).
alter table mcp_tool_invocations enable row level security;
alter table mcp_rate_limits enable row level security;

-- Helper the edge function uses to decide whether to allow a new tool
-- call. Returns remaining quota (>= 0 means allowed) and window
-- reset time. SECURITY DEFINER so it can read mcp_rate_limits under
-- RLS; the caller is the edge function's service role anyway, but
-- wrapping the logic in SQL keeps the query plan cached + consistent.
create or replace function public.check_mcp_rate_limit(p_user_id uuid)
returns table (
  allowed boolean,
  remaining int,
  retry_after_seconds int,
  hourly_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
  v_oldest timestamptz;
begin
  -- Default limit is 120/hour. Override per-user via mcp_rate_limits.
  select coalesce(
    (select hourly_limit from mcp_rate_limits where user_id = p_user_id),
    120
  ) into v_limit;

  select count(*), min(created_at)
    into v_count, v_oldest
  from mcp_tool_invocations
  where user_id = p_user_id
    and created_at > now() - interval '1 hour';

  if v_count < v_limit then
    return query select
      true::boolean,
      (v_limit - v_count)::int,
      0::int,
      v_limit::int;
    return;
  end if;

  -- Over limit: retry-after is time until the oldest counted invocation
  -- falls outside the 1-hour window.
  return query select
    false::boolean,
    0::int,
    greatest(
      1,
      ceil(extract(epoch from (v_oldest + interval '1 hour') - now()))::int
    ),
    v_limit::int;
end;
$$;
