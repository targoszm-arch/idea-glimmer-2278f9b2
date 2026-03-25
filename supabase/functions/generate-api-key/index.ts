import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    // Get existing key — mask it for security (show first 8 chars only)
    const { data } = await adminSupabase
      .from("api_keys")
      .select("key, created_at, last_used_at")
      .eq("user_id", user.id)
      .single();
    return new Response(
      JSON.stringify({ key: data?.key ?? null, created_at: data?.created_at, last_used_at: data?.last_used_at }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  if (req.method === "POST") {
    // Use the SECURITY DEFINER DB function to atomically generate key
    const { data, error } = await adminSupabase.rpc("create_api_key_for_user", { p_user_id: user.id });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(
      JSON.stringify({ key: data }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
});
