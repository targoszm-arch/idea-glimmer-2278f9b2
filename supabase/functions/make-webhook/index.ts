import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: require webhook secret - no secret = no access
    const WEBHOOK_SECRET = Deno.env.get("MAKE_WEBHOOK_SECRET");
    const provided =
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (!WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "MAKE_WEBHOOK_SECRET not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!provided || provided !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Require user_id param so webhook only returns that user's articles
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id query param required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("articles")
      .select("title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, author_name, reading_time_minutes, faq_html")
      .eq("status", "published")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const stripStyles = (html: string) => html?.replace(/\s*style="[^"]*"/gi, "") ?? "";
    const articles = (data ?? []).map((a) => ({
      title: a.title,
      slug: (a.slug ?? "").substring(0, 64).replace(/-+$/, ""),
      body: stripStyles(a.content),
      excerpt: a.excerpt,
      meta_description: a.meta_description,
      category: a.category,
      cover_image: a.cover_image_url ?? "",
      published_date: a.created_at,
      author_name: a.author_name ?? "",
      reading_time_minutes: a.reading_time_minutes ?? 0,
      faq: stripStyles(a.faq_html ?? ""),
    }));

    return new Response(JSON.stringify(articles), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("make-webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
