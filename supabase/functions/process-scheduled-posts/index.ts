import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Processes scheduled social posts that are due. Invoked by pg_cron every minute.
// - Finds social_posts rows where status='scheduled' and scheduled_at <= now()
// - Looks up the user's linkedin_connections entry for the access token
// - Posts directly to LinkedIn's UGC Posts API
// - Marks the row as 'posted' or 'failed' with an error_message

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function publishToLinkedIn(accessToken: string, linkedinId: string, content: string, articleUrl?: string | null): Promise<string> {
  // LinkedIn UGC Posts API. See https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
  const body: any = {
    author: `urn:li:person:${linkedinId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: articleUrl ? "ARTICLE" : "NONE",
        ...(articleUrl
          ? { media: [{ status: "READY", originalUrl: articleUrl }] }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  const data = await res.json();
  const postId = data.id;
  // Construct a best-effort public URL
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Deployed with `verify_jwt: false` and no internal auth check — matches
  // `process-newsletter-queue`. The function only processes rows where
  // `status='scheduled' AND scheduled_at <= now()`, so an arbitrary caller
  // can at worst cause the cron to do its job slightly earlier. Previously
  // this required `Authorization: Bearer ${SERVICE_ROLE_KEY}`, but the cron
  // migration relied on `current_setting('app.service_role_key')` which was
  // never set on prod — so every cron invocation was silently returning
  // 401 and posts stayed `scheduled` forever. Removing the check aligns
  // with the newsletter worker that has been running this way for months.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Find all scheduled posts that are due (look back 7 days so we don't miss any
  // during a downtime).
  const nowIso = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: due, error } = await supabase
    .from("social_posts")
    .select("id, user_id, platform, content, article_id, scheduled_at")
    .eq("status", "scheduled")
    .gte("scheduled_at", sevenDaysAgo)
    .lte("scheduled_at", nowIso)
    .limit(50);

  if (error) {
    console.error("Failed to load due posts:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string; url?: string }> = [];

  for (const post of due ?? []) {
    try {
      if (post.platform !== "linkedin") {
        // Only LinkedIn is supported for auto-publish currently. Mark others failed.
        await supabase.from("social_posts")
          .update({ status: "failed", error_message: `Auto-posting to ${post.platform} is not supported yet` })
          .eq("id", post.id);
        results.push({ id: post.id, ok: false, error: "platform not supported" });
        continue;
      }

      // Look up the user's LinkedIn credentials
      const { data: conn } = await supabase
        .from("linkedin_connections")
        .select("linkedin_id, access_token, expires_at")
        .eq("user_id", post.user_id)
        .maybeSingle();

      if (!conn?.access_token || !conn?.linkedin_id) {
        await supabase.from("social_posts")
          .update({ status: "failed", error_message: "LinkedIn not connected — reconnect in Settings → Integrations" })
          .eq("id", post.id);
        results.push({ id: post.id, ok: false, error: "not connected" });
        continue;
      }

      if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
        await supabase.from("social_posts")
          .update({ status: "failed", error_message: "LinkedIn token expired — reconnect in Settings → Integrations" })
          .eq("id", post.id);
        results.push({ id: post.id, ok: false, error: "token expired" });
        continue;
      }

      // Optionally fetch the article URL so the post includes a link preview.
      // IMPORTANT: this URL is what LinkedIn scrapes for the og:* metadata and
      // what readers actually click. Use the article's own `url_path` which
      // already encodes the correct category/slug structure (e.g.
      // "getting-started/<slug>", "instructional-design/<slug>", etc). The
      // site renders each article at `https://www.skillstudio.ai/<url_path>`.
      //
      // History of this bug:
      // - v2: `app.content-lab.ie/article/<slug>` — internal auth-gated URL
      // - v6: `skillstudio.ai/latest-articles/<slug>` — hardcoded the wrong
      //       category. Only 1 of 116 articles is actually under
      //       `latest-articles/`; the rest are under other categories, so
      //       every share linked to a 404.
      // - now: use `url_path` → correct for any category; fall back to bare
      //       slug for legacy rows where url_path was never populated.
      let articleUrl: string | null = null;
      if (post.article_id) {
        const { data: article } = await supabase
          .from("articles")
          .select("url_path, slug")
          .eq("id", post.article_id)
          .maybeSingle();
        const path = (article?.url_path || article?.slug || "").replace(/^\/+/, "");
        if (path) {
          articleUrl = `https://www.skillstudio.ai/${path}`;
        }
      }

      const postUrl = await publishToLinkedIn(conn.access_token, conn.linkedin_id, post.content, articleUrl);

      await supabase.from("social_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          posted_url: postUrl,
          error_message: null,
        })
        .eq("id", post.id);
      results.push({ id: post.id, ok: true, url: postUrl });
    } catch (e: any) {
      console.error(`Failed to post ${post.id}:`, e);
      await supabase.from("social_posts")
        .update({ status: "failed", error_message: (e?.message ?? "Unknown error").slice(0, 500) })
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, error: e?.message ?? "unknown" });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
