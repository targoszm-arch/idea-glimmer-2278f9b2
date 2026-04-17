// Atlassian OAuth 2.0 (3LO) callback.
//
// Exchanges the auth code for an access_token + refresh_token, then
// calls /oauth/token/accessible-resources to list the cloud sites this
// user can access. We store the first site as the default in
// user_integrations (user can change via sync-to-confluence's
// list_sites mode later if they have multiple).
//
// Row stored in user_integrations:
//   platform             "confluence"
//   access_token         bearer JWT, ~60 min TTL
//   refresh_token        long-lived, used by sync-to-confluence to refresh
//   platform_user_id     cloudId (the site id, not a user id — kept in
//                        this column because that's the pattern the other
//                        integrations follow)
//   platform_user_name   cloud site URL (so the Integrations UI can show
//                        "Connected: skillstudio.atlassian.net")
//   metadata             { cloud_id, site_url, scopes, expires_at }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const frontendBase = "https://www.app.content-lab.ie/settings/integrations";

  if (!code || !state) {
    return Response.redirect(`${frontendBase}?error=missing_params&platform=confluence`);
  }

  try {
    const { user_id } = JSON.parse(atob(state));

    const CLIENT_ID = Deno.env.get("ATLASSIAN_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("ATLASSIAN_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Atlassian OAuth not configured on server");
    }

    const REDIRECT_URI =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/confluence-oauth-callback`;

    // Step 1: exchange code for tokens.
    const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Step 2: list accessible resources (cloud sites) this user can touch.
    // A single Atlassian account can have access to multiple org sites,
    // each with its own cloudId. We grab the first one as the default.
    const resourcesRes = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    const resources = await resourcesRes.json();
    if (!resourcesRes.ok || !Array.isArray(resources) || resources.length === 0) {
      throw new Error(
        "No accessible Atlassian cloud sites found. Make sure you have access to at least one Confluence space.",
      );
    }

    const primary = resources[0];
    const cloudId: string = primary.id;
    const siteUrl: string = primary.url;

    // Expiry of the access token in ISO. Refresh tokens last much longer
    // (typically 90 days rolling) — the sync function refreshes before
    // every request so we don't have to track refresh expiry here.
    const expiresAt = new Date(
      Date.now() + (tokenData.expires_in ?? 3600) * 1000,
    ).toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("user_integrations").upsert(
      {
        user_id,
        platform: "confluence",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        platform_user_id: cloudId,
        platform_user_name: siteUrl.replace(/^https?:\/\//, ""),
        metadata: {
          cloud_id: cloudId,
          site_url: siteUrl,
          scopes: (tokenData.scope ?? "").split(" ").filter(Boolean),
          expires_at: expiresAt,
          all_sites: resources.map((r: any) => ({
            id: r.id,
            url: r.url,
            name: r.name,
          })),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" },
    );

    return Response.redirect(`${frontendBase}?success=confluence_connected`);
  } catch (e) {
    return Response.redirect(
      `${frontendBase}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Unknown error",
      )}&platform=confluence`,
    );
  }
});
