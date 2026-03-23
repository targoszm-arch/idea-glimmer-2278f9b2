import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (req.method === "GET") {
    // Get existing key
    const { data } = await adminSupabase.from("api_keys").select("*").eq("user_id", user.id).limit(1).single();
    return new Response(JSON.stringify({ key: data?.key ?? null }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "POST") {
    // Delete old key and generate new one
    await adminSupabase.from("api_keys").delete().eq("user_id", user.id);
    const newKey = "cl_" + crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await adminSupabase.from("api_keys").insert({ user_id: user.id, key: newKey }).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ key: data.key }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
});
