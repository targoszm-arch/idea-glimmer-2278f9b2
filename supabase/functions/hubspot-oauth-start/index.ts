// HubSpot OAuth 2.0 start — builds the consent URL.
//
// Scopes requested (minimum needed to pull contact + company variables
// for personalised outreach: {{first_name}}, {{last_name}}, etc.):
//   - oauth                         required by HubSpot
//   - crm.objects.contacts.read     read contacts
//   - crm.schemas.contacts.read     read contact property schema (custom props)
//   - crm.objects.companies.read    read company associations
//   - crm.schemas.companies.read    read company property schema
//
// Env vars required (Supabase → Settings → Edge Functions → Secrets):
//   HUBSPOT_CLIENT_ID
//   HUBSPOT_CLIENT_SECRET
// Redirect URI to register in the HubSpot app:
//   https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/hubspot-oauth-callback

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.schemas.contacts.read",
  "crm.objects.companies.read",
  "crm.schemas.companies.read",
].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await supabaseAuth.auth.getUser();
    if (error || !user) return json({ error: "Unauthorized" }, 401);

    const CLIENT_ID = Deno.env.get("HUBSPOT_CLIENT_ID");
    if (!CLIENT_ID) return json({ error: "HubSpot OAuth not configured. Set HUBSPOT_CLIENT_ID secret." }, 500);

    const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hubspot-oauth-callback`;

    // PKCE: generate a fresh random code_verifier per flow and embed it
    // inside the OAuth `state` so the callback (different Deno isolate)
    // can recover it for the token exchange. Per RFC 7636 the verifier
    // is 43-128 chars from [A-Z a-z 0-9 - . _ ~]. We use base64url of
    // 32 random bytes (43 chars).
    const codeVerifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const codeChallenge = b64url(new Uint8Array(challengeBytes));

    const state = btoa(JSON.stringify({ user_id: user.id, ts: Date.now(), v: codeVerifier }));

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return json({ url: `https://app.hubspot.com/oauth/authorize?${params}` });
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

// RFC 4648 §5 base64url encoder (no padding).
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
