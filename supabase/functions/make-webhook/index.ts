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
    // Optional secret check — only enforced if MAKE_WEBHOOK_SECRET is set
    // AND the caller provides a header. Make.com GET requests without headers
    // are allowed through since this endpoint only returns published articles.
    const WEBHOOK_SECRET = Deno.env.get("MAKE_WEBHOOK_SECRET");
    if (WEBHOOK_SECRET) {
      const provided =
        req.headers.get("x-webhook-secret") ??
        req.headers.get("authorization")?.replace("Bearer ", "");
      // Only reject if a secret is configured AND the caller sent something wrong
      // (not if they sent nothing — Make.com plain GET has no headers)
      if (provided && provided !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("articles")
      .select("title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, author_name, reading_time_minutes, faq_html")
      .eq("status", "published")
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
