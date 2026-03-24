import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { shop } = body; // e.g. "mystore.myshopify.com" — user enters this
    if (!shop) return new Response(JSON.stringify({ error: "shop domain is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
    const REDIRECT_URI = "https://content-lab.ie/integrations/shopify/callback";
    const SCOPES = "write_content,read_content";

    const state = btoa(JSON.stringify({ user_id: user.id, shop, ts: Date.now() }));

    const params = new URLSearchParams({
      client_id: SHOPIFY_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
    });

    const authUrl = `https://${shop}/admin/oauth/authorize?${params}`;

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
