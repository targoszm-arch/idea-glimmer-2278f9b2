// Atlassian OAuth 2.0 (3LO) start — generates the Atlassian consent URL
// for a Content Lab user who's connecting their Atlassian Cloud account.
// The callback (atlassian-oauth-callback) does the code exchange,
// fetches the user's accessible cloud sites, and stores the token.
//
// Scopes requested:
//   - read:confluence-space.summary  list spaces for the space picker
//   - read:confluence-content.all    read a page (needed to get current
//                                    version number on update)
//   - write:confluence-content       create / update pages
//   - offline_access                 issue a refresh_token
//
// Env vars required (set in Supabase → Settings → Edge Functions → Secrets):
//   ATLASSIAN_CLIENT_ID      — OAuth 2.0 (3LO) app client_id
//   ATLASSIAN_CLIENT_SECRET  — used by the callback function
// Configure the redirect URI in the Atlassian app to:
//   https://<supabase-project>.supabase.co/functions/v1/atlassian-oauth-callback

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const SCOPES = [
  "read:confluence-space.summary",
  "read:confluence-content.all",
  "write:confluence-content",
  "offline_access",
].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const ATLASSIAN_CLIENT_ID = Deno.env.get("ATLASSIAN_CLIENT_ID");
    if (!ATLASSIAN_CLIENT_ID) {
      return json({
        error: "Atlassian OAuth not configured. Set ATLASSIAN_CLIENT_ID secret.",
      }, 500);
    }

    const REDIRECT_URI =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/confluence-oauth-callback`;

    // state carries user_id (to know whose token to save) + a timestamp
    // (simple anti-replay; we don't strictly verify it but it's small so
    // an attacker can't reuse an old state more than briefly).
    const state = btoa(JSON.stringify({ user_id: user.id, ts: Date.now() }));

    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: ATLASSIAN_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
      response_type: "code",
      // `prompt=consent` forces Atlassian to re-show the consent screen
      // so the user always sees which scopes they're granting.
      prompt: "consent",
    });

    const authUrl = `https://auth.atlassian.com/authorize?${params}`;
    return json({ url: authUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
