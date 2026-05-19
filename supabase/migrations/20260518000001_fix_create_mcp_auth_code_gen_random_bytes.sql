-- Fix: create_mcp_auth_code crashed the MCP OAuth authorize step with
-- "function gen_random_bytes(integer) does not exist". The function has
-- search_path set to 'public' only, but gen_random_bytes lives in the
-- 'extensions' schema (pgcrypto). Qualify the call explicitly.

CREATE OR REPLACE FUNCTION public.create_mcp_auth_code(p_client_id text, p_redirect_uri text, p_code_challenge text, p_code_challenge_method text, p_scope text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_code := 'mcpa_' || encode(extensions.gen_random_bytes(32), 'hex');

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
$function$;
