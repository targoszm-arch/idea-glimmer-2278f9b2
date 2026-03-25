import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Validate API key
  const { data: keyData } = await admin.from("api_keys").select("user_id").eq("key", token).single();
  if (!keyData) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: cors });

  const { post_id, canva_design_token, scheduled_at } = await req.json();
  if (!post_id || !canva_design_token) {
    return new Response(JSON.stringify({ error: "post_id and canva_design_token are required" }), { status: 400, headers: cors });
  }

  const updateData: Record<string, any> = {
    canva_design_token,
    status: "scheduled",
  };
  if (scheduled_at) updateData.scheduled_at = scheduled_at;

  const { error } = await admin
    .from("social_post_ideas")
    .update(updateData)
    .eq("id", post_id)
    .eq("user_id", keyData.user_id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
