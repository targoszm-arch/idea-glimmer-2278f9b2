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
    const state = btoa(JSON.stringify({ user_id: user.id, ts: Date.now() }));

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
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
