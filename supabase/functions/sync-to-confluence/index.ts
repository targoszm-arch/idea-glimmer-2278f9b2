// Publish a Content Lab article to Confluence as a page.
//
// Modes (dispatched on request body):
//
//   { list_spaces: true }
//     → returns the cloud's Confluence spaces for the pre-publish picker.
//       Response: { spaces: [{ id, key, name }], site_url }
//
//   { article_id, space_id }
//     → creates or updates a Confluence page.
//       - First publish: POST /wiki/api/v2/pages, stores confluence_page_id
//         + confluence_space_id + confluence_cloud_id on the article row.
//       - Subsequent publishes: GET the page to learn the current version
//         number, then PUT /wiki/api/v2/pages/{id} with version+1.
//       Response: { success, confluence_page_id, action: 'created'|'updated', page_url }
//
// Token refresh: Atlassian access tokens expire ~60 min; refresh tokens
// are long-lived. We check the stored expiry before each request and
// refresh eagerly if it's within 2 min of expiring.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Confluence Storage Format is an XHTML-like dialect. It accepts a
// reasonable subset of HTML, but <script>, inline event handlers, and
// self-closing tags that aren't really void elements can trip up the
// validator. Minimal sanitization — strip things that always break.
function sanitizeForConfluence(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await supabase
      .from("user_integrations")
      .select("access_token, refresh_token, metadata")
      .eq("user_id", user.id)
      .eq("platform", "confluence")
      .single();

    if (!integration) {
      return json(
        {
          error:
            "Confluence not connected. Please connect it in Settings → Integrations.",
          code: "NOT_CONNECTED",
        },
        403,
      );
    }

    const accessToken = await ensureFreshToken(supabase, user.id, integration);
    const cloudId = (integration.metadata as any)?.cloud_id;
    const siteUrl = (integration.metadata as any)?.site_url;

    if (!cloudId) {
      return json({ error: "No Confluence cloud site linked" }, 500);
    }

    const apiBase = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2`;
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const body = await req.json();

    // ── Mode: list spaces ──────────────────────────────────────────────
    if (body.list_spaces) {
      const res = await fetch(`${apiBase}/spaces?limit=250`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(`Spaces fetch failed: ${JSON.stringify(data)}`);
      return json({
        spaces: (data.results || []).map((s: any) => ({
          id: s.id,
          key: s.key,
          name: s.name,
        })),
        site_url: siteUrl,
      });
    }

    // ── Mode: sync article ─────────────────────────────────────────────
    const { article_id, space_id } = body;
    if (!article_id) return json({ error: "article_id is required" }, 400);

    const { data: article } = await supabase
      .from("articles")
      .select("*")
      .eq("id", article_id)
      .single();

    if (!article) return json({ error: "Article not found" }, 404);

    const existingPageId = (article as any).confluence_page_id;
    const existingSpaceId =
      (article as any).confluence_space_id || space_id;

    if (!existingPageId && !space_id) {
      return json(
        { error: "space_id is required for first publish", code: "NEED_SPACE" },
        400,
      );
    }

    const cleanedContent = sanitizeForConfluence(article.content || "");
    const pagePayload: Record<string, unknown> = {
      status: article.status === "published" ? "current" : "draft",
      title: article.title,
      body: {
        representation: "storage",
        value: cleanedContent,
      },
    };

    let res: Response;
    let action: "created" | "updated";

    if (existingPageId) {
      // Update path: v2 PUT requires spaceId + current version number.
      const getRes = await fetch(
        `${apiBase}/pages/${existingPageId}`,
        { headers: authHeaders },
      );
      if (!getRes.ok) {
        const errData = await getRes.text();
        throw new Error(`Page fetch failed: ${getRes.status} ${errData}`);
      }
      const currentPage = await getRes.json();

      const updatePayload = {
        ...pagePayload,
        id: existingPageId,
        spaceId: existingSpaceId,
        version: {
          number: (currentPage.version?.number ?? 0) + 1,
          message: "Updated from Content Lab",
        },
      };

      res = await fetch(`${apiBase}/pages/${existingPageId}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      action = "updated";
    } else {
      const createPayload = { ...pagePayload, spaceId: space_id };
      res = await fetch(`${apiBase}/pages`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      });
      action = "created";
    }

    const responseData = await res.json();
    if (!res.ok) {
      return json(
        {
          error:
            responseData.errors?.[0]?.title ||
            responseData.message ||
            `Confluence sync failed (${res.status})`,
          details: responseData,
        },
        res.status,
      );
    }

    const pageId = responseData.id || existingPageId;
    const pageUrl = `${siteUrl}/wiki/spaces/${
      responseData._links?.webui?.split?.("/spaces/")?.[1]?.split?.("/")?.[0] ?? ""
    }${responseData._links?.webui ?? ""}`;

    // On first create, persist the page + space + cloud identifiers so
    // later syncs become idempotent updates.
    if (action === "created") {
      await supabase
        .from("articles")
        .update({
          confluence_page_id: String(pageId),
          confluence_space_id: String(space_id),
          confluence_cloud_id: String(cloudId),
        })
        .eq("id", article_id);
    }

    return json({
      success: true,
      confluence_page_id: pageId,
      action,
      page_url: pageUrl,
    });
  } catch (e) {
    console.error("sync-to-confluence error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// Token refresh helper
// ─────────────────────────────────────────────────────────────────────

// If the stored access token is within 2 minutes of expiring, refresh
// it via the refresh_token grant and write the new pair back. Returns
// the valid access token.
async function ensureFreshToken(
  supabase: any,
  userId: string,
  integration: any,
): Promise<string> {
  const expiresAt = integration.metadata?.expires_at
    ? new Date(integration.metadata.expires_at).getTime()
    : 0;
  const now = Date.now();
  const stillFresh = expiresAt > now + 120_000; // 2-minute buffer

  if (stillFresh || !integration.refresh_token) {
    return integration.access_token;
  }

  const CLIENT_ID = Deno.env.get("ATLASSIAN_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("ATLASSIAN_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) {
    // Fall back to current token; request may still succeed if clock
    // drift or a small window made us refresh prematurely.
    return integration.access_token;
  }

  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: integration.refresh_token,
    }),
  });

  if (!res.ok) {
    // If the refresh fails (e.g. token revoked), surface the current
    // token and let the downstream call return 401. UI will prompt the
    // user to reconnect.
    return integration.access_token;
  }

  const refreshed = await res.json();
  const newExpiresAt = new Date(
    Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  ).toISOString();

  await supabase
    .from("user_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? integration.refresh_token,
      metadata: {
        ...(integration.metadata ?? {}),
        expires_at: newExpiresAt,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("platform", "confluence");

  return refreshed.access_token;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
