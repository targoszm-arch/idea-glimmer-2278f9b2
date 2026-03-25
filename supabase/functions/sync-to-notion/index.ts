import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function htmlToNotionBlocks(html: string): any[] {
  const blocks: any[] = [];
  const clean = html.replace(/<style[^>]*>.*?<\/style>/gis, "").replace(/<script[^>]*>.*?<\/script>/gis, "");
  const parts = clean.split(/(<h[1-6][^>]*>.*?<\/h[1-6]>|<p[^>]*>.*?<\/p>|<ul[^>]*>.*?<\/ul>|<ol[^>]*>.*?<\/ol>|<blockquote[^>]*>.*?<\/blockquote>|<img[^>]+\/?>)/gis);

  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const hMatch = t.match(/^<h([1-6])[^>]*>(.*?)<\/h[1-6]>$/is);
    if (hMatch) {
      const type = parseInt(hMatch[1]) === 1 ? "heading_1" : parseInt(hMatch[1]) === 2 ? "heading_2" : "heading_3";
      const text = stripTags(hMatch[2]);
      if (text) blocks.push({ object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
      continue;
    }
    const imgMatch = t.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    if (imgMatch) { blocks.push({ object: "block", type: "image", image: { type: "external", external: { url: imgMatch[1] } } }); continue; }
    const ulMatch = t.match(/^<ul[^>]*>(.*?)<\/ul>$/is);
    if (ulMatch) { for (const li of ulMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis) || []) { const text = stripTags(li); if (text) blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } }); } continue; }
    const olMatch = t.match(/^<ol[^>]*>(.*?)<\/ol>$/is);
    if (olMatch) { for (const li of olMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis) || []) { const text = stripTags(li); if (text) blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } }); } continue; }
    const pMatch = t.match(/^<p[^>]*>(.*?)<\/p>$/is);
    const text = stripTags(pMatch ? pMatch[1] : t);
    if (text && !/^<[^>]+>$/.test(text)) blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } });
  }
  return blocks.slice(0, 100);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get user's Notion token from integrations table
    const { data: integration } = await supabase.from("user_integrations").select("access_token, metadata").eq("user_id", user.id).eq("platform", "notion").single();
    if (!integration) return new Response(JSON.stringify({ error: "Notion not connected. Please connect Notion in Settings → Integrations.", code: "NOT_CONNECTED" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const notionHeaders = { "Authorization": `Bearer ${integration.access_token}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };
    const body = await req.json();

    // List databases mode
    if (body.list_databases) {
      const res = await fetch("https://api.notion.com/v1/search", { method: "POST", headers: notionHeaders, body: JSON.stringify({ filter: { value: "database", property: "object" } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to list databases");
      return new Response(JSON.stringify({ databases: (data.results || []).map((d: any) => ({ id: d.id, name: d.title?.[0]?.plain_text || "Untitled" })) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { article_id, database_id } = body;
    if (!article_id) return new Response(JSON.stringify({ error: "article_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!database_id) return new Response(JSON.stringify({ error: "database_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: article } = await supabase.from("articles").select("*").eq("id", article_id).single();
    if (!article) return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const contentBlocks = htmlToNotionBlocks(cleanContentForPublish(article.content || ""));
    const pageProperties: Record<string, any> = {
      "Name": { title: [{ text: { content: article.title } }] },
      "Status": { select: { name: article.status === "published" ? "Published" : "Draft" } },
      "Category": { rich_text: [{ text: { content: article.category || "" } }] },
      "Excerpt": { rich_text: [{ text: { content: (article.excerpt || "").slice(0, 2000) } }] },
      "Slug": { rich_text: [{ text: { content: article.slug || "" } }] },
      "Published Date": { date: { start: article.created_at?.split("T")[0] } },
    };
    if (article.cover_image_url && !article.cover_image_url.startsWith("data:")) pageProperties["Cover Image"] = { url: article.cover_image_url };

    const existingId = article.notion_page_id;
    let notionPageId = existingId;

    if (existingId) {
      const updateRes = await fetch(`https://api.notion.com/v1/pages/${existingId}`, { method: "PATCH", headers: notionHeaders, body: JSON.stringify({ properties: pageProperties }) });
      if (!updateRes.ok) { const d = await updateRes.json(); throw new Error(d.message || "Failed to update"); }
      const childrenRes = await fetch(`https://api.notion.com/v1/blocks/${existingId}/children`, { headers: notionHeaders });
      const childrenData = await childrenRes.json();
      for (const block of childrenData.results || []) await fetch(`https://api.notion.com/v1/blocks/${block.id}`, { method: "DELETE", headers: notionHeaders });
    } else {
      const createRes = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: notionHeaders, body: JSON.stringify({ parent: { database_id }, properties: pageProperties, ...(article.cover_image_url && !article.cover_image_url.startsWith("data:") ? { cover: { type: "external", external: { url: article.cover_image_url } } } : {}) }) });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.message || "Failed to create page");
      notionPageId = createData.id;
      await supabase.from("articles").update({ notion_page_id: notionPageId }).eq("id", article_id);
    }

    for (let i = 0; i < contentBlocks.length; i += 100) {
      await fetch(`https://api.notion.com/v1/blocks/${notionPageId}/children`, { method: "PATCH", headers: notionHeaders, body: JSON.stringify({ children: contentBlocks.slice(i, i + 100) }) });
    }

    return new Response(JSON.stringify({ success: true, notion_page_id: notionPageId, action: existingId ? "updated" : "created", blocks_synced: contentBlocks.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
