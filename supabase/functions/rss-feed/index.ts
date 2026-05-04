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

  // Fetch RSS-enabled articles for this user, most recent first.
  // Articles with rss_publish_at set in the future are held back so users
  // can stage when Zapier / LinkedIn picks them up.
  // The Framer plugin sync doesn't currently set framer_item_id, so we
  // can't filter on it without zeroing out the whole feed. The user is
  // responsible for only enabling rss_enabled on articles that exist in
  // Framer until we wire up framer_item_id from the plugin write-back.
  const nowIso = new Date().toISOString();
  const { data: articles, error: articlesErr } = await db
    .from("articles")
    .select("id, title, excerpt, url_path, cover_image_url, created_at, updated_at, rss_publish_at, category")
    .eq("user_id", settings.user_id)
    .eq("rss_enabled", true)
    .eq("status", "published")
    .or(`rss_publish_at.is.null,rss_publish_at.lte.${nowIso}`)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (articlesErr) {
    return new Response("Internal error", { status: 500 });
  }

  // Add UTM tags so PostHog/GA can attribute clicks back to the LinkedIn
  // RSS feed (Zapier reposts each item to LinkedIn). guid is built without
  // UTMs so feed readers don't treat the same item with different campaigns
  // as different posts.
  const items = (articles ?? []).map((a) => {
    const baseLink = `${baseUrl}/${a.url_path ?? a.id}`;
    const slugForCampaign = (a.url_path ?? a.id).split("/").pop() || a.id;
    const utm = new URLSearchParams({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "rss",
      utm_content: slugForCampaign,
    }).toString();
    const link = `${baseLink}?${utm}`;
    // Use rss_publish_at as the pubDate when set so Zapier sees the item
    // with the user-chosen broadcast time and treats it as "new on that day".
    const pubDate = new Date(a.rss_publish_at || a.updated_at || a.created_at).toUTCString();
    const desc = escapeXml(a.excerpt || "");
    const title = escapeXml(a.title || "Untitled");
    const imageTag = a.cover_image_url
      ? `<enclosure url="${escapeXml(a.cover_image_url)}" type="image/jpeg" length="0" />
      <media:content url="${escapeXml(a.cover_image_url)}" medium="image" type="image/jpeg"/>
      <media:thumbnail url="${escapeXml(a.cover_image_url)}"/>`
      : "";
    return `
    <item>
      <title>${title}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(baseLink)}</guid>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      ${imageTag}
    </item>`;
  }).join("\n");

  const selfUrl = escapeXml(`${SUPABASE_URL}/functions/v1/rss-feed?token=${token}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${siteTitle}</title>
    <link>${escapeXml(baseUrl)}</link>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>
    <description>Latest articles from ${siteTitle}</description>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Short cache so Zapier / LinkedIn pick up newly RSS-enabled articles
      // within ~1 minute instead of waiting up to an hour.
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
