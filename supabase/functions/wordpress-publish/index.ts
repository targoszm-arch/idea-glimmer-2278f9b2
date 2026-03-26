import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanContentForPublish } from "../_shared/content.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    const anonSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonSupabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { action } = body;

    // ACTION: test_connection
    if (action === "test_connection") {
      const { site_url, username, app_password } = body;
      if (!site_url || !username || !app_password) {
        return new Response(JSON.stringify({ error: "site_url, username, and app_password are required" }), { status: 400, headers: cors });
      }
      const base = site_url.replace(/\/$/, "");
      const resp = await fetch(`${base}/wp-json/wp/v2/users/me`, {
        headers: {
          Authorization: "Basic " + btoa(`${username}:${app_password}`),
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return new Response(JSON.stringify({ ok: false, error: `WordPress returned ${resp.status}: ${txt.slice(0, 200)}` }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const wpUser = await resp.json();
      return new Response(JSON.stringify({ ok: true, display_name: wpUser.name, site_url: base }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ACTION: publish
    if (action === "publish") {
      const { article_id } = body;
      if (!article_id) return new Response(JSON.stringify({ error: "article_id required" }), { status: 400, headers: cors });

      // Get WordPress credentials from user_integrations
      const { data: integration } = await adminSupabase
        .from("user_integrations")
        .select("access_token, platform_user_name, metadata")
        .eq("user_id", user.id)
        .eq("platform", "wordpress")
        .single();

      if (!integration) {
        return new Response(JSON.stringify({ error: "WordPress not connected. Go to Settings → Integrations." }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const meta = integration.metadata as any;
      const siteUrl = meta?.site_url ?? integration.platform_user_name;
      const username = meta?.username;
      const appPassword = integration.access_token;
      const base = siteUrl.replace(/\/$/, "");
      const authBasic = "Basic " + btoa(`${username}:${appPassword}`);

      // Get article
      const { data: article } = await adminSupabase
        .from("articles")
        .select("id, title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, updated_at, reading_time_minutes, author_name, wp_post_id, wp_permalink, source, automation_name")
        .eq("id", article_id)
        .eq("user_id", user.id)
        .single();

      if (!article) return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: cors });

      // Get or create WordPress category
      let wpCategoryId: number | undefined;
      if (article.category) {
        // Search for existing category
        const catSearch = await fetch(`${base}/wp-json/wp/v2/categories?search=${encodeURIComponent(article.category)}`, {
          headers: { Authorization: authBasic },
        });
        const cats = await catSearch.json();
        const existing = cats.find((c: any) => c.name.toLowerCase() === article.category.toLowerCase());
        if (existing) {
          wpCategoryId = existing.id;
        } else {
          // Create category
          const createCat = await fetch(`${base}/wp-json/wp/v2/categories`, {
            method: "POST",
            headers: { Authorization: authBasic, "Content-Type": "application/json" },
            body: JSON.stringify({ name: article.category }),
          });
          if (createCat.ok) {
            const newCat = await createCat.json();
            wpCategoryId = newCat.id;
          }
        }
      }

      // Publish to WordPress
      const postPayload: any = {
        title: article.title,
        content: cleanContentForPublish(article.content),
        status: "publish",
        excerpt: article.excerpt || "",
        ...(wpCategoryId ? { categories: [wpCategoryId] } : {}),
        ...(article.created_at ? { date: article.created_at } : {}),
      };

      const wpResp = await fetch(`${base}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { Authorization: authBasic, "Content-Type": "application/json" },
        body: JSON.stringify(postPayload),
      });

      if (!wpResp.ok) {
        const txt = await wpResp.text();
        throw new Error(`WordPress publish failed (${wpResp.status}): ${txt.slice(0, 300)}`);
      }

      const wpPost = await wpResp.json();

      // Store wp_post_id and wp_permalink on article
      await adminSupabase.from("articles").update({
        wp_post_id: wpPost.id,
        wp_permalink: wpPost.link,
      }).eq("id", article_id);

      return new Response(JSON.stringify({ ok: true, wp_post_id: wpPost.id, wp_permalink: wpPost.link }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
  } catch (e: any) {
    console.error("wordpress-publish error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
