import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const SHOPIFY_STORE = Deno.env.get("SHOPIFY_STORE_DOMAIN"); // e.g. mystore.myshopify.com
    const SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
    if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be configured");

    const shopifyBase = `https://${SHOPIFY_STORE}/admin/api/2024-01`;
    const shopifyHeaders = {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    };

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    // ── Mode: list_blogs — lets the UI show a blog picker ──────────────────
    if (body.list_blogs) {
      const res = await fetch(`${shopifyBase}/blogs.json`, { headers: shopifyHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors || "Failed to list Shopify blogs");
      return new Response(JSON.stringify({
        blogs: (data.blogs || []).map((b: any) => ({ id: b.id, name: b.title })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode: sync article ─────────────────────────────────────────────────
    const { article_id, blog_id } = body;
    if (!article_id) return new Response(JSON.stringify({ error: "article_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!blog_id) return new Response(JSON.stringify({ error: "blog_id is required — pass the Shopify blog ID to sync into" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: article, error: fetchError } = await supabase.from("articles").select("*").eq("id", article_id).single();
    if (fetchError || !article) return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const shopifyArticle: Record<string, any> = {
      title: article.title,
      body_html: article.content || "",
      summary_html: article.excerpt || "",
      tags: article.category || "",
      published: article.status === "published",
      handle: article.slug,
      metafields: [
        { namespace: "seo", key: "description", value: article.meta_description || "", type: "single_line_text_field" },
      ],
    };

    if (article.cover_image_url && !article.cover_image_url.startsWith("data:")) {
      shopifyArticle.image = { src: article.cover_image_url, alt: article.title };
    }

    if (article.author_name) {
      shopifyArticle.author = article.author_name;
    }

    const existingShopifyId = article.shopify_article_id;
    let shopifyArticleId = existingShopifyId;
    let action = "created";

    if (existingShopifyId) {
      // Update existing article
      const updateRes = await fetch(`${shopifyBase}/blogs/${blog_id}/articles/${existingShopifyId}.json`, {
        method: "PUT",
        headers: shopifyHeaders,
        body: JSON.stringify({ article: shopifyArticle }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(JSON.stringify(updateData.errors) || "Failed to update Shopify article");
      action = "updated";
    } else {
      // Create new article
      const createRes = await fetch(`${shopifyBase}/blogs/${blog_id}/articles.json`, {
        method: "POST",
        headers: shopifyHeaders,
        body: JSON.stringify({ article: shopifyArticle }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(JSON.stringify(createData.errors) || "Failed to create Shopify article");
      shopifyArticleId = createData.article?.id;

      // Save shopify_article_id back to article
      await supabase.from("articles").update({ shopify_article_id: String(shopifyArticleId) }).eq("id", article_id);
    }

    return new Response(JSON.stringify({
      success: true,
      shopify_article_id: shopifyArticleId,
      shopify_blog_id: blog_id,
      action,
      shopify_url: `https://${SHOPIFY_STORE}/blogs/${blog_id}/articles/${shopifyArticleId}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("sync-to-shopify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
