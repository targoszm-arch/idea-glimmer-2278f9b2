import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data, error: authError } = await supabase.auth.getClaims(token);
  if (authError || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const userId = data.claims.sub as string;

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    const { data: keyData } = await adminSupabase
      .from("api_keys")
      .select("key, created_at, last_used_at")
      .eq("user_id", userId)
      .single();
    return new Response(
      JSON.stringify({ key: keyData?.key ?? null, created_at: keyData?.created_at, last_used_at: keyData?.last_used_at }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  if (req.method === "POST") {
    const { data: newKey, error } = await adminSupabase.rpc("create_api_key_for_user", { p_user_id: userId });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(
      JSON.stringify({ key: newKey }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
});
