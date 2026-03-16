import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
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

    const articles = (data ?? []).map((a) => ({
      title: a.title,
      slug: (a.slug ?? "").substring(0, 64).replace(/-+$/, ""),
      body: a.content,
      excerpt: a.excerpt,
      meta_description: a.meta_description,
      category: a.category,
      cover_image: a.cover_image_url ?? "",
      published_date: a.created_at,
      author_name: a.author_name ?? "",
      reading_time_minutes: a.reading_time_minutes ?? 0,
      faq: a.faq_html ?? "",
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
