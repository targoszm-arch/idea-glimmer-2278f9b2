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

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");

  let query = admin
    .from("social_post_ideas")
    .select("id, platform, title_suggestion, description, status, created_at, canva_design_token, scheduled_at")
    .eq("user_id", keyData.user_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (platform && platform !== "all") {
    query = query.ilike("platform", platform);
  }

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  return new Response(JSON.stringify({ posts: data ?? [] }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
