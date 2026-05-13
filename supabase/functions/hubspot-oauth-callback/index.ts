// HubSpot OAuth 2.0 callback.
//
// Exchanges the authorization code for an access_token + refresh_token,
// fetches the portal/hub id + user info via /oauth/v1/access-tokens/{token},
// and stores everything in user_integrations under platform='hubspot'.
//
// Notes:
//   - HubSpot token endpoint expects application/x-www-form-urlencoded, NOT
//     JSON. Sending JSON returns INVALID_GRANT with a useless error.
//   - access_token TTLs are 30 min. refresh_token is long-lived. Other code
//     paths that need to call HubSpot APIs should refresh first by POSTing
//     { grant_type: "refresh_token", refresh_token } to /oauth/v1/token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const frontendBase = "https://www.app.content-lab.ie/settings/integrations";

  if (!code || !state) {
    return Response.redirect(`${frontendBase}?error=missing_params&platform=hubspot`);
  }

  try {
    // state from hubspot-oauth-start carries { user_id, ts, v (code_verifier) }.
    const parsedState = JSON.parse(atob(state));
    const user_id: string = parsedState.user_id;
    const codeVerifier: string | undefined = parsedState.v;

    const CLIENT_ID = Deno.env.get("HUBSPOT_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("HUBSPOT_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("HubSpot OAuth not configured on server");

    const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hubspot-oauth-callback`;

    // Step 1: code → tokens. Form-encoded body, not JSON.
    // PKCE: if the start endpoint embedded a code_verifier in state, send
    // it here so HubSpot can confirm the SHA-256(verifier) == code_challenge
    // we sent at the authorize step.
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    });
    if (codeVerifier) tokenParams.set("code_verifier", codeVerifier);
    const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Step 2: introspect the token to get hub (portal) id + user email.
    const infoRes = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${tokenData.access_token}`,
    );
    const info = await infoRes.json();
    // Fields per docs: hub_id, hub_domain, user, user_id, scopes, expires_in,
    // app_id, scope_to_scope_group_pks, token_type
    const hubId = String(info?.hub_id ?? "");
    const hubDomain: string = info?.hub_domain ?? "";
    const userEmail: string = info?.user ?? "";

    const expiresAt = new Date(
      Date.now() + (tokenData.expires_in ?? 1800) * 1000,
    ).toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("user_integrations").upsert(
      {
        user_id,
        platform: "hubspot",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        platform_user_id: hubId,
        platform_user_name: hubDomain || userEmail,
        metadata: {
          hub_id: hubId,
          hub_domain: hubDomain,
          user_email: userEmail,
          scopes: Array.isArray(info?.scopes) ? info.scopes : [],
          expires_at: expiresAt,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" },
    );

    return Response.redirect(`${frontendBase}?success=hubspot_connected`);
  } catch (e) {
    return Response.redirect(
      `${frontendBase}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Unknown error",
      )}&platform=hubspot`,
    );
  }
});
