import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const NOTION_CLIENT_ID = Deno.env.get("NOTION_CLIENT_ID");
    const REDIRECT_URI = Deno.env.get("NOTION_REDIRECT_URI") ?? "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/notion-oauth-callback";

    if (!NOTION_CLIENT_ID) throw new Error("NOTION_CLIENT_ID not configured");

    // Encode user ID in state param so callback knows who to save the token for
    const state = btoa(JSON.stringify({ user_id: user.id, ts: Date.now() }));

    const params = new URLSearchParams({
      client_id: NOTION_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      owner: "user",
      state,
    });

    const authUrl = `https://api.notion.com/v1/oauth/authorize?${params}`;

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
