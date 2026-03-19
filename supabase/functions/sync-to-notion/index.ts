import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert HTML to Notion blocks (simplified but covers all main cases)
function htmlToNotionBlocks(html: string): any[] {
  const blocks: any[] = [];

  // Strip tags we can't convert, normalize whitespace
  const clean = html
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<script[^>]*>.*?<\/script>/gis, "");

  // Split by block-level tags
  const parts = clean.split(/(<h[1-6][^>]*>.*?<\/h[1-6]>|<p[^>]*>.*?<\/p>|<ul[^>]*>.*?<\/ul>|<ol[^>]*>.*?<\/ol>|<blockquote[^>]*>.*?<\/blockquote>|<img[^>]+\/>|<img[^>]+>)/gis);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Headings
    const hMatch = trimmed.match(/^<h([1-6])[^>]*>(.*?)<\/h[1-6]>$/is);
    if (hMatch) {
      const level = parseInt(hMatch[1]);
      const text = stripTags(hMatch[2]);
      if (!text) continue;
      const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      blocks.push({ object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
      continue;
    }

    // Images
    const imgMatch = trimmed.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    if (imgMatch) {
      blocks.push({ object: "block", type: "image", image: { type: "external", external: { url: imgMatch[1] } } });
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^<ul[^>]*>(.*?)<\/ul>$/is);
    if (ulMatch) {
      const items = ulMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis) || [];
      for (const item of items) {
        const text = stripTags(item);
        if (text) blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
      }
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^<ol[^>]*>(.*?)<\/ol>$/is);
    if (olMatch) {
      const items = olMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis) || [];
      for (const item of items) {
        const text = stripTags(item);
        if (text) blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
      }
      continue;
    }

    // Blockquote
    const bqMatch = trimmed.match(/^<blockquote[^>]*>(.*?)<\/blockquote>$/is);
    if (bqMatch) {
      const text = stripTags(bqMatch[1]);
      if (text) blocks.push({ object: "block", type: "quote", quote: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
      continue;
    }

    // Paragraph (default)
    const pMatch = trimmed.match(/^<p[^>]*>(.*?)<\/p>$/is);
    const text = stripTags(pMatch ? pMatch[1] : trimmed);
    if (text && !text.match(/^<[^>]+>$/)) {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
    }
  }

  return blocks.slice(0, 100); // Notion API limit per request
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

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

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY is not configured");

    const notionHeaders = {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    // ── Mode: list_databases — lets the UI show a database picker ──────────
    if (body.list_databases) {
      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({ filter: { value: "database", property: "object" } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to list Notion databases");
      return new Response(JSON.stringify({
        databases: (data.results || []).map((d: any) => ({
          id: d.id,
          name: d.title?.[0]?.plain_text || "Untitled",
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode: sync article ─────────────────────────────────────────────────
    const { article_id, database_id } = body;
    if (!article_id) return new Response(JSON.stringify({ error: "article_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!database_id) return new Response(JSON.stringify({ error: "database_id is required — pass the Notion database ID to sync into" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: article, error: fetchError } = await supabase.from("articles").select("*").eq("id", article_id).single();
    if (fetchError || !article) return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const contentBlocks = htmlToNotionBlocks(article.content || "");

    const pageProperties: Record<string, any> = {
      "Name": { title: [{ text: { content: article.title } }] },
      "Status": { select: { name: article.status === "published" ? "Published" : "Draft" } },
      "Category": { rich_text: [{ text: { content: article.category || "" } }] },
      "Excerpt": { rich_text: [{ text: { content: (article.excerpt || "").slice(0, 2000) } }] },
      "Slug": { rich_text: [{ text: { content: article.slug || "" } }] },
      "Published Date": { date: { start: article.created_at?.split("T")[0] || new Date().toISOString().split("T")[0] } },
    };

    if (article.cover_image_url && !article.cover_image_url.startsWith("data:")) {
      pageProperties["Cover Image"] = { url: article.cover_image_url };
    }

    const existingNotionId = article.notion_page_id;
    let notionPageId = existingNotionId;

    if (existingNotionId) {
      // Update existing page properties
      const updateRes = await fetch(`https://api.notion.com/v1/pages/${existingNotionId}`, {
        method: "PATCH",
        headers: notionHeaders,
        body: JSON.stringify({ properties: pageProperties }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(updateData.message || "Failed to update Notion page");

      // Clear and rewrite content blocks
      const childrenRes = await fetch(`https://api.notion.com/v1/blocks/${existingNotionId}/children`, { headers: notionHeaders });
      const childrenData = await childrenRes.json();
      for (const block of childrenData.results || []) {
        await fetch(`https://api.notion.com/v1/blocks/${block.id}`, { method: "DELETE", headers: notionHeaders });
      }
    } else {
      // Create new page
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({
          parent: { database_id },
          properties: pageProperties,
          ...(article.cover_image_url && !article.cover_image_url.startsWith("data:")
            ? { cover: { type: "external", external: { url: article.cover_image_url } } }
            : {}),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.message || "Failed to create Notion page");
      notionPageId = createData.id;

      // Save notion_page_id back to article
      await supabase.from("articles").update({ notion_page_id: notionPageId }).eq("id", article_id);
    }

    // Append content blocks (in batches of 100)
    for (let i = 0; i < contentBlocks.length; i += 100) {
      const batch = contentBlocks.slice(i, i + 100);
      await fetch(`https://api.notion.com/v1/blocks/${notionPageId}/children`, {
        method: "PATCH",
        headers: notionHeaders,
        body: JSON.stringify({ children: batch }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      notion_page_id: notionPageId,
      action: existingNotionId ? "updated" : "created",
      blocks_synced: contentBlocks.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("sync-to-notion error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
