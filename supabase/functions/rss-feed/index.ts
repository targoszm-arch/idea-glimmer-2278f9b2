// Public RSS feed endpoint for LinkedIn content streaming.
//
// URL: /functions/v1/rss-feed?token=<rss_token>
//
// No auth required — the rss_token acts as a per-user secret so the URL
// is unguessable. LinkedIn polls this URL to auto-post articles.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Look up the user by their rss_token
  const { data: settings, error: settingsErr } = await db
    .from("ai_settings")
    .select("user_id, newsletter_website_url")
    .eq("rss_token", token)
    .single();

  if (settingsErr || !settings) {
    return new Response(JSON.stringify({ error: "Not found", token_prefix: token.slice(0, 8), settingsErr: settingsErr?.message }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const baseUrl = (settings.newsletter_website_url || "https://www.skillstudio.ai").replace(/\/$/, "");
  const siteTitle = escapeXml("Content Lab");

  // Fetch RSS-enabled articles for this user, most recent first
  const { data: articles, error: articlesErr } = await db
    .from("articles")
    .select("id, title, excerpt, url_path, cover_image_url, created_at, updated_at, category")
    .eq("user_id", settings.user_id)
    .eq("rss_enabled", true)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (articlesErr) {
    return new Response("Internal error", { status: 500 });
  }

  const items = (articles ?? []).map((a) => {
    const link = `${baseUrl}/${a.url_path ?? a.id}`;
    const pubDate = new Date(a.updated_at || a.created_at).toUTCString();
    const desc = escapeXml(a.excerpt || "");
    const title = escapeXml(a.title || "Untitled");
    const imageTag = a.cover_image_url
      ? `<enclosure url="${escapeXml(a.cover_image_url)}" type="image/jpeg" length="0" />`
      : "";
    return `
    <item>
      <title>${title}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      ${imageTag}
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${siteTitle}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Latest articles from ${siteTitle}</description>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
