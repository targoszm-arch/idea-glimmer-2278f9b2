import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const xApiKey = req.headers.get("x-api-key") ?? "";
  const token = (authHeader.replace("Bearer ", "").trim()) || xApiKey.trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string | null = null;

  if (token.startsWith("cl_")) {
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
    await adminSupabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", token);
  } else {
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
    const countOnly = url.searchParams.get("count_only") === "1";

    // For count/category checks, skip heavy content fields
    const selectFields = countOnly
      ? "id, category"
      : "id, title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, updated_at, reading_time_minutes, author_name, article_meta";

    let query = adminSupabase
      .from("articles")
      .select(selectFields)
      .eq("status", "published")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (categoryFilter && categoryFilter !== "all") {
      query = query.ilike("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Extract categories from the same query — no second DB round trip
    const categories = [...new Set(
      (data ?? []).map((r: any) => r.category).filter(Boolean)
    )].sort();

    if (countOnly) {
      return new Response(
        JSON.stringify({ ok: true, count: (data ?? []).length, categories }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flatten article_meta fields into top-level for Framer
    const articles = (data ?? []).map((a: any) => {
      const meta = a.article_meta || {};

      // keywords: array of strings -> comma-separated
      const keywords = Array.isArray(meta.keywords)
        ? meta.keywords.join(", ")
        : (meta.keywords ?? "");

      // facts: array of strings -> bullet list
      const facts = Array.isArray(meta.facts)
        ? meta.facts.map((f: string) => `• ${f}`).join("\n")
        : (meta.facts ?? "");

      // sources/references: array of {url, title} -> newline-separated URLs
      const references = Array.isArray(meta.sources)
        ? meta.sources.map((s: any) => s.url || "").filter(Boolean).join("\n")
        : (meta.references ?? "");

      return {
        ...a,
        keywords,
        facts,
        references,
      };
    });

    return new Response(
      JSON.stringify({ ok: true, count: articles.length, articles, categories }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
