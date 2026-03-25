import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get user's Shopify token
    const { data: integration } = await supabase.from("user_integrations").select("access_token, metadata").eq("user_id", user.id).eq("platform", "shopify").single();
    if (!integration) return new Response(JSON.stringify({ error: "Shopify not connected. Please connect Shopify in Settings → Integrations.", code: "NOT_CONNECTED" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const shop = integration.metadata?.shop_domain;
    const shopifyBase = `https://${shop}/admin/api/2024-01`;
    const shopifyHeaders = { "X-Shopify-Access-Token": integration.access_token, "Content-Type": "application/json" };

    const body = await req.json();

    // List blogs mode
    if (body.list_blogs) {
      const res = await fetch(`${shopifyBase}/blogs.json`, { headers: shopifyHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors || "Failed to list blogs");
      return new Response(JSON.stringify({ blogs: (data.blogs || []).map((b: any) => ({ id: b.id, name: b.title })) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { article_id, blog_id } = body;
    if (!article_id) return new Response(JSON.stringify({ error: "article_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!blog_id) return new Response(JSON.stringify({ error: "blog_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: article } = await supabase.from("articles").select("*").eq("id", article_id).single();
    if (!article) return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const shopifyArticle: Record<string, any> = {
      title: article.title,
      body_html: article.content || "",
      summary_html: article.excerpt || "",
      tags: article.category || "",
      published: article.status === "published",
      handle: article.slug,
      metafields: [{ namespace: "seo", key: "description", value: article.meta_description || "", type: "single_line_text_field" }],
    };
    if (article.cover_image_url && !article.cover_image_url.startsWith("data:")) shopifyArticle.image = { src: article.cover_image_url, alt: article.title };
    if (article.author_name) shopifyArticle.author = article.author_name;

    const existingId = article.shopify_article_id;
    let shopifyArticleId = existingId;

    if (existingId) {
      const res = await fetch(`${shopifyBase}/blogs/${blog_id}/articles/${existingId}.json`, { method: "PUT", headers: shopifyHeaders, body: JSON.stringify({ article: shopifyArticle }) });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.errors) || "Failed to update");
    } else {
      const res = await fetch(`${shopifyBase}/blogs/${blog_id}/articles.json`, { method: "POST", headers: shopifyHeaders, body: JSON.stringify({ article: shopifyArticle }) });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.errors) || "Failed to create");
      shopifyArticleId = data.article?.id;
      await supabase.from("articles").update({ shopify_article_id: String(shopifyArticleId) }).eq("id", article_id);
    }

    return new Response(JSON.stringify({ success: true, shopify_article_id: shopifyArticleId, action: existingId ? "updated" : "created" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
