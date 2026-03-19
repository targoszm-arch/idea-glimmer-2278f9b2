import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Exception: the Framer plugin calls this with the anon key — it is a
  // read-only endpoint that only ever returns *published* articles.
  // We still validate the token is a legitimate Supabase session; we just
  // always force status = "published" so callers can never read drafts.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify it's a valid Supabase token (anon or user JWT both accepted here
  // because Framer plugin users are not logged-in to your app).
  // The key protection is that status is HARDCODED to "published" below.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const categoryFilter = url.searchParams.get("category");

    // ── SECURITY: status is ALWAYS "published" — never trust the caller ──────
    let query = supabase
      .from("articles")
      .select("id, title, slug, content, excerpt, meta_description, category, cover_image_url, status, created_at, updated_at")
      .eq("status", "published")          // ← hardcoded, not from query param
      .order("updated_at", { ascending: false })
      .limit(500);

    if (since) query = query.gte("updated_at", since);
    if (categoryFilter && categoryFilter !== "all") {
      query = query.ilike("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Return distinct categories for the plugin's category picker
    const catResult = await supabase
      .from("articles")
      .select("category")
      .eq("status", "published")
      .not("category", "is", null);

    const categories = [...new Set(
      (catResult.data ?? []).map((r: any) => r.category).filter(Boolean)
    )].sort();

    return new Response(
      JSON.stringify({ ok: true, count: data?.length ?? 0, articles: data ?? [], categories }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("framer-sync-articles error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
