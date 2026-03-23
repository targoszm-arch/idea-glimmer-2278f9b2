import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check if token is a ContentLab API key (starts with cl_)
  let userId: string | null = null;

  if (token.startsWith("cl_")) {
    // Validate against api_keys table
    const { data: keyData } = await adminSupabase
      .from("api_keys")
      .select("user_id")
      .eq("key", token)
      .single();

    if (!keyData) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    userId = keyData.user_id;

    // Update last_used_at
    await adminSupabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", token);
  } else {
    // Fall back to Supabase JWT (anon key for dev)
    const anonSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonSupabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
  }

  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category");

    let query = adminSupabase
      .from("articles")
      .select("id, title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, updated_at")
      .eq("status", "published")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (categoryFilter && categoryFilter !== "all") {
      query = query.ilike("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    const catResult = await adminSupabase
      .from("articles")
      .select("category")
      .eq("status", "published")
      .eq("user_id", userId)
      .not("category", "is", null);

    const categories = [...new Set(
      (catResult.data ?? []).map((r: any) => r.category).filter(Boolean)
    )].sort();

    return new Response(
      JSON.stringify({ ok: true, count: data?.length ?? 0, articles: data ?? [], categories }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
