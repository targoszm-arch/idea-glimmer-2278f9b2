// Content Lab MCP server (v1).
// Speaks the Model Context Protocol over Streamable HTTP (a single POST endpoint
// that handles JSON-RPC 2.0 requests). Lets Claude cowork / Claude Desktop drive
// Content Lab via a small set of tools that wrap existing edge functions and
// tables.
//
// Auth: bearer `cl_` API key (looked up in the api_keys table) — same pattern
// used by framer-sync-articles. JWT also accepted for local testing.
//
// Tools exposed in v1:
//   - create_article          forwards to the generate-article edge function
//   - list_articles           direct query on the articles table
//   - list_social_posts       direct query on the social_posts table
//   - schedule_social_post    direct insert into social_posts (cron publishes it)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, mcp-protocol-version",
};

// JSON-RPC 2.0 error codes
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "contentlab-mcp", version: "0.1.0" };

// Public app URL used for deep-links surfaced back to MCP clients.
const APP_URL = "https://www.app.content-lab.ie";
const CALENDAR_URL = `${APP_URL}/calendar`;

// Safety cap — how many future `status='scheduled'` rows a single user may
// accumulate before `schedule_social_post` starts refusing new ones. A
// runaway agent (like the one that scheduled 20 LinkedIn posts unprompted)
// should hit this, back off, and ask the user before continuing. Users can
// override by passing `force: true` in the tool arguments.
const MCP_SCHEDULE_CAP = 5;

type AuthContext = { userId: string; admin: SupabaseClient; token: string };

// ---------------------------------------------------------------------------
// Auth — accepts two credential types:
//   1. `cl_` API keys (legacy custom-connector flow; the shape used since v1)
//   2. OAuth 2.1 access tokens (HS256 JWTs issued by mcp-oauth-token)
// The legacy path is copied from framer-sync-articles/index.ts (lines 12-54).
// ---------------------------------------------------------------------------
async function authenticate(req: Request): Promise<AuthContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const xApiKey = req.headers.get("x-api-key") ?? "";
  const token = (authHeader.replace("Bearer ", "").trim()) || xApiKey.trim();

  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string | null = null;

  if (token.startsWith("cl_")) {
    const { data: keyData } = await admin
      .from("api_keys")
      .select("user_id")
      .eq("key", token)
      .single();

    if (!keyData) return jsonResponse({ error: "Invalid API key" }, 401);

    userId = keyData.user_id;
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", token);
  } else if (isLikelyJwt(token)) {
    // Try MCP OAuth access token first. If that fails (wrong issuer, bad
    // signature), fall back to Supabase JWT so `supabase functions invoke`
    // local testing still works.
    const oauthUser = await verifyMcpOAuthToken(token);
    if (oauthUser) {
      userId = oauthUser;
    } else {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anon.auth.getUser();
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = user.id;
    }
  } else {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { userId: userId!, admin, token };
}

function isLikelyJwt(token: string): boolean {
  return token.split(".").length === 3;
}

// Verifies an MCP OAuth access token (HS256 JWT issued by mcp-oauth-token).
// Returns the user id (sub claim) on success, or null on any failure — the
// caller decides how to handle invalid tokens.
async function verifyMcpOAuthToken(token: string): Promise<string | null> {
  const secret = Deno.env.get("MCP_OAUTH_SIGNING_KEY");
  if (!secret) return null; // OAuth disabled in this environment

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    // Check signature first — we only trust the payload if the signature matches.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signatureBytes = base64urlDecode(encodedSignature);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput),
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encodedPayload)));

    // Issuer + audience must match what mcp-oauth-token signed. The
    // audience check (RFC 8707) prevents a token issued for some other
    // resource from being accepted here.
    if (payload.iss !== "https://rnshobvpqegttrpaowxe.supabase.co") return null;
    if (payload.aud !== "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp") {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

// create_article — re-invoke the existing generate-article edge function so
// credit deduction, Perplexity wiring, and the prompt stay in one place.
// We use the service role key + user_id_override (the path generate-article
// already supports for automation runners).
//
// IMPORTANT: generate-article is a streaming endpoint — it pipes the
// Perplexity response body straight through and does NOT write to the
// articles table. The browser UI consumes the stream, assembles the HTML,
// and then calls a direct `articles.insert()`. So for MCP we have to do the
// same thing server-side:
//   1. Fire the fetch in the background (EdgeRuntime.waitUntil)
//   2. Read the SSE stream, accumulate the generated HTML
//   3. Parse title + meta JSON out of the content
//   4. Insert the article row ourselves
// Otherwise credits get deducted but nothing is ever saved.
//
// Because the Perplexity generation takes 60–120s we can't await this in
// the HTTP request — we return `status: started` immediately and the user
// polls list_articles.
async function createArticleHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!args?.topic || typeof args.topic !== "string") {
    throw new Error("`topic` is required and must be a string");
  }

  const body = { ...args, user_id_override: ctx.userId };

  const generation = (async () => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-article`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[create_article] generate-article returned ${res.status} for user ${ctx.userId}: ${errText}`);
        return;
      }
      if (!res.body) {
        console.error(`[create_article] no response body from generate-article for user ${ctx.userId}`);
        return;
      }

      // Consume the SSE stream from Perplexity (via generate-article).
      // Each line looks like: `data: {"choices":[{"delta":{"content":"..."}}]}`
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let html = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]" || payload === "") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") html += delta;
          } catch { /* skip malformed chunks */ }
        }
      }

      if (html.trim().length === 0) {
        console.error(`[create_article] empty generation for user ${ctx.userId}`);
        return;
      }

      // Parse title from first <h1>
      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 200)
        : args.topic.slice(0, 80);

      // Parse metadata from the comment blocks emitted by the current
      // generate-article prompt:
      //   <!-- META_DESCRIPTION: ... -->
      //   <!-- ARTICLE_META_JSON: {...} -->
      // (The old META_JSON_START/END format is still matched as a fallback
      // for any cached prompts.)
      let articleMeta: Record<string, unknown> | null = null;
      let metaDescription = "";

      const metaDescMatch = html.match(/<!--\s*META_DESCRIPTION:\s*(.*?)\s*-->/i);
      if (metaDescMatch?.[1]) metaDescription = metaDescMatch[1].trim().slice(0, 150);

      const metaJsonMatch = html.match(/<!--\s*ARTICLE_META_JSON:\s*([\s\S]*?)\s*-->/i)
        || html.match(/<!--\s*META_JSON_START([\s\S]*?)META_JSON_END\s*-->/i);
      if (metaJsonMatch?.[1]) {
        try {
          articleMeta = JSON.parse(metaJsonMatch[1].trim());
          // Legacy: some older prompts stored meta_description inside the
          // JSON blob; prefer that when the dedicated comment is missing.
          if (!metaDescription && typeof (articleMeta as any)?.meta_description === "string") {
            metaDescription = (articleMeta as any).meta_description;
          }
        } catch (e) {
          console.warn(`[create_article] meta JSON parse failed for user ${ctx.userId}:`, e);
        }
      }

      // Build FAQPage + BlogPosting JSON-LD server-side from the structured
      // metadata — the model is explicitly told NOT to emit <script> tags
      // because JSON syntax errors were the single biggest breakage source.
      const faqPairs = Array.isArray((articleMeta as any)?.faq_pairs)
        ? ((articleMeta as any).faq_pairs as Array<{ question: string; answer: string }>)
            .filter(f => f?.question && f?.answer)
        : [];
      const jsonLdBlocks: string[] = [];
      if (faqPairs.length > 0) {
        jsonLdBlocks.push(
          `<script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqPairs.map(f => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          })}</script>`,
        );
      }
      {
        const today = new Date().toISOString().split("T")[0];
        const blog: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: title,
          description: metaDescription,
          datePublished: today,
          dateModified: today,
        };
        const section = (args.category as string) || (articleMeta as any)?.primary_focus;
        if (section) blog.articleSection = section;
        const kws = (articleMeta as any)?.keywords;
        if (Array.isArray(kws) && kws.length) blog.keywords = kws.join(", ");
        jsonLdBlocks.push(`<script type="application/ld+json">${JSON.stringify(blog)}</script>`);
      }

      // Clean: strip meta comment blocks, code fences, inline styles, any
      // stray <script> blocks the model may have emitted despite the prompt.
      const cleanedHtml = html
        .replace(/<!--\s*META_TITLE:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*META_DESCRIPTION:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*COVER_IMAGE_PROMPT:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*ARTICLE_META_JSON:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*META_JSON_START[\s\S]*?META_JSON_END\s*-->/g, "")
        .replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/^```html\s*|\s*```\s*$/g, "")
        .replace(/\s*style="[^"]*"/gi, "")
        .trim();

      // Append our freshly-built JSON-LD so the published article has valid
      // structured data every time.
      const cleanContent = jsonLdBlocks.length > 0
        ? `${cleanedHtml}\n${jsonLdBlocks.join("\n")}`
        : cleanedHtml;

      const plainText = cleanContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const excerpt = plainText.slice(0, 200);
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 200));

      const slug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64) || `article-${Date.now()}`;

      const payload: Record<string, unknown> = {
        user_id: ctx.userId,
        title,
        slug,
        content: cleanContent,
        excerpt,
        meta_description: metaDescription.slice(0, 150),
        category: args.category ?? "",
        content_type: args.content_type ?? "blog",
        status: "draft",
        reading_time_minutes: readingTime,
      };
      if (articleMeta) payload.article_meta = articleMeta;

      const admin = createClient(supabaseUrl, serviceKey);
      const { data, error } = await admin.from("articles").insert(payload).select().single();
      if (error) {
        console.error(`[create_article] DB insert failed for user ${ctx.userId}: ${error.message}`);
        return;
      }
      console.log(`[create_article] saved article ${data.id} (${title}) for user ${ctx.userId}`);

      // Generate a cover image the same way the browser UI does (DALL-E 3 via
      // the generate-cover-image edge function). The UI treats this as a
      // separate step a user clicks, but for MCP-driven article creation we
      // do it automatically — Claude has no other affordance to request one.
      // Costs 5 additional credits. If it fails, we still keep the article.
      try {
        const coverPrompt = metaDescription.trim() || title;
        const contextSnippet = plainText.slice(0, 500);
        const coverRes = await fetch(`${supabaseUrl}/functions/v1/generate-cover-image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: coverPrompt,
            context: contextSnippet,
            user_id_override: ctx.userId,
          }),
        });
        if (!coverRes.ok) {
          const errText = await coverRes.text();
          console.warn(`[create_article] cover image skipped for article ${data.id}: ${coverRes.status} ${errText}`);
        } else {
          const coverJson = await coverRes.json();
          const imageUrl: string | undefined = coverJson?.image_url;
          if (imageUrl) {
            const { error: updateErr } = await admin
              .from("articles")
              .update({ cover_image_url: imageUrl })
              .eq("id", data.id);
            if (updateErr) {
              console.warn(`[create_article] cover image URL update failed for article ${data.id}: ${updateErr.message}`);
            } else {
              console.log(`[create_article] cover image attached to article ${data.id}`);
            }
          }
        }
      } catch (e) {
        console.warn(`[create_article] cover image generation threw for article ${data.id}:`, e);
      }
    } catch (e) {
      console.error(`[create_article] background generation threw for user ${ctx.userId}:`, e);
    }
  })();

  // Detach so the HTTP response returns immediately.
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(generation);

  return {
    status: "started",
    topic: args.topic,
    message:
      "Article generation started. A DALL-E 3 cover image is generated automatically after the article finishes. Typical total runtime is 90–150 seconds. Call `list_articles` in about 2 minutes to see your new article with its cover image (status='draft'). Costs 5 credits for the article + 5 credits for the cover image = 10 credits. The article is saved even if cover-image generation fails; you can regenerate the cover from the article editor.",
  };
}

async function listArticlesHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const limit = clampInt(args?.limit, 1, 200, 50);

  let query = ctx.admin
    .from("articles")
    .select("id, title, slug, status, content_type, category, created_at, updated_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (args?.status) query = query.eq("status", args.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { count: data?.length ?? 0, articles: data ?? [] };
}

// get_article — returns full body including `content` so Claude can read
// what was actually generated before writing social copy or refining it.
// The list_* tools deliberately omit content to keep token use reasonable;
// callers should list first, then get by id.
async function getArticleHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const id = args?.id;
  if (typeof id !== "string" || id.length === 0) throw new Error("`id` is required");

  const { data, error } = await ctx.admin
    .from("articles")
    .select(
      "id, title, slug, content, excerpt, meta_description, category, content_type, status, cover_image_url, reading_time_minutes, article_meta, url_path, created_at, updated_at",
    )
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Article not found");
  return data;
}

// update_article — partial update of the user's own article. Only
// whitelisted fields are accepted; id/slug/user_id/sync metadata stay
// server-controlled. The row's `user_id` filter ensures one user can't
// mutate another user's article even with a valid key.
async function updateArticleHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const id = args?.id;
  if (typeof id !== "string" || id.length === 0) throw new Error("`id` is required");

  const allowed = [
    "title",
    "content",
    "excerpt",
    "meta_description",
    "category",
    "content_type",
    "status",
    "cover_image_url",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) update[key] = args[key];
  }

  if (Object.keys(update).length === 0) {
    throw new Error(`No updatable fields provided. Allowed: ${allowed.join(", ")}`);
  }

  if (typeof update.status === "string" && !["draft", "published", "scheduled", "archived"].includes(update.status as string)) {
    throw new Error("`status` must be one of: draft, published, scheduled, archived");
  }

  // Recompute reading time whenever content changes so the library's
  // estimated-read badge stays in sync with the edit.
  if (typeof update.content === "string") {
    const plainText = (update.content as string).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    (update as Record<string, unknown>).reading_time_minutes = Math.max(1, Math.ceil(wordCount / 200));
    // Keep excerpt roughly consistent if caller didn't pass one.
    if (typeof update.excerpt !== "string") {
      (update as Record<string, unknown>).excerpt = plainText.slice(0, 200);
    }
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await ctx.admin
    .from("articles")
    .update(update)
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .select(
      "id, title, slug, status, content_type, category, cover_image_url, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Article not found or you don't have access");
  return data;
}

async function listSocialPostsHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const limit = clampInt(args?.limit, 1, 200, 50);

  let query = ctx.admin
    .from("social_posts")
    .select("id, platform, content, status, scheduled_at, posted_at, posted_url, error_message, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args?.status) query = query.eq("status", args.status);
  if (args?.platform) query = query.eq("platform", args.platform);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return {
    count: data?.length ?? 0,
    posts: data ?? [],
    review_url: CALENDAR_URL,
  };
}

async function scheduleSocialPostHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const platform = args?.platform;
  const content = args?.content;
  const scheduledAt = args?.scheduled_at;
  const articleId = args?.article_id ?? null;
  const force = args?.force === true;

  if (platform !== "linkedin") throw new Error("Only `platform: linkedin` is supported in v1");
  if (typeof content !== "string" || content.trim().length === 0) throw new Error("`content` is required");
  if (typeof scheduledAt !== "string") throw new Error("`scheduled_at` is required (ISO 8601)");

  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) throw new Error("`scheduled_at` is not a valid ISO 8601 datetime");
  if (when.getTime() <= Date.now()) throw new Error("`scheduled_at` must be in the future");

  // Safety cap: count existing future-scheduled posts for this user and
  // refuse to add more once the cap is hit, unless the caller passes
  // `force: true`. This stops an agent from silently queuing up 20 posts.
  if (!force) {
    const { count: pendingCount, error: countError } = await ctx.admin
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("status", "scheduled")
      .gt("scheduled_at", new Date().toISOString());

    if (countError) throw new Error(`Failed to check schedule cap: ${countError.message}`);
    if ((pendingCount ?? 0) >= MCP_SCHEDULE_CAP) {
      throw new Error(
        `Schedule cap reached: you already have ${pendingCount} scheduled posts (cap is ${MCP_SCHEDULE_CAP}). ` +
          `Ask the user to review/cancel pending posts at ${CALENDAR_URL} before scheduling more. ` +
          `If the user explicitly wants to exceed the cap, call this tool again with \`force: true\`.`,
      );
    }
  }

  // `topic` is NOT NULL on the table; derive a short label from content.
  const topic = content.slice(0, 100);

  const { data, error } = await ctx.admin
    .from("social_posts")
    .insert({
      user_id: ctx.userId,
      platform,
      topic,
      content,
      status: "scheduled",
      scheduled_at: when.toISOString(),
      article_id: articleId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { ...data, review_url: CALENDAR_URL };
}

// ---------------------------------------------------------------------------
// Newsletter tools
//
// Newsletters are ONE-TIME scheduled sends. There is no recurrence. The
// schedule-newsletter edge function inserts a single row with
// status='scheduled' and a single `scheduled_at` timestamp; the cron
// worker (process-newsletter-queue) picks up due rows every 5 minutes
// and sends them via Resend exactly once.
//
// Tool descriptions intentionally repeat "one-time" so an agent doesn't
// later assume there's a frequency knob and tell the user otherwise.
// ---------------------------------------------------------------------------

async function listNewsletterSchedulesHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const limit = clampInt(args?.limit, 1, 200, 50);

  let query = ctx.admin
    .from("newsletter_schedules")
    .select(
      "id, article_id, subject_line, preview_text, audience_type, resend_audience_id, scheduled_at, status, recipient_count, sent_at, error_message, created_at, updated_at",
    )
    .eq("user_id", ctx.userId)
    .order("scheduled_at", { ascending: false })
    .limit(limit);

  if (args?.status) query = query.eq("status", args.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return {
    count: data?.length ?? 0,
    schedules: data ?? [],
    review_url: CALENDAR_URL,
  };
}

// Build the newsletter HTML the same way Calendar.tsx does when a user
// schedules from the UI: take the article's saved `newsletter_data.html`
// and wrap it with Resend-friendly defaults (preview text, unsubscribe
// link, open pixel placeholder for send-newsletter to inject). If the
// article has no newsletter_data we error rather than guessing — Claude
// should generate newsletter_data first via the newsletter editor.
function buildNewsletterHtml(opts: {
  bodyHtml: string;
  previewText: string;
  fromName: string;
}): string {
  const safePreview = opts.previewText.replace(/[<>]/g, "");
  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.fromName}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;">
  <span style="display:none;font-size:1px;color:#f6f6f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreview}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
        <tr><td style="padding:32px 32px 24px 32px;line-height:1.6;font-size:16px;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
          You're receiving this because you subscribed. <a href="{{UNSUBSCRIBE_URL}}" style="color:#888;">Unsubscribe</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function scheduleNewsletterHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const articleId = args?.article_id;
  const scheduledAt = args?.scheduled_at;
  const audienceType = args?.audience_type ?? "contacts";
  const resendAudienceId = args?.resend_audience_id ?? null;
  const force = args?.force === true;

  if (typeof articleId !== "string" || articleId.length === 0) {
    throw new Error("`article_id` is required");
  }
  if (typeof scheduledAt !== "string") {
    throw new Error("`scheduled_at` is required (ISO 8601 datetime, one-time send)");
  }
  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) throw new Error("`scheduled_at` is not a valid ISO 8601 datetime");
  if (when.getTime() <= Date.now()) throw new Error("`scheduled_at` must be in the future");

  if (audienceType !== "contacts" && audienceType !== "resend_list") {
    throw new Error("`audience_type` must be 'contacts' or 'resend_list'");
  }
  if (audienceType === "resend_list" && !resendAudienceId) {
    throw new Error("`resend_audience_id` is required when audience_type='resend_list'");
  }

  // Mirror the social-post safety cap: stop a runaway agent from queuing
  // more than 5 future newsletters in one go. Override with force=true.
  if (!force) {
    const { count: pendingCount, error: countError } = await ctx.admin
      .from("newsletter_schedules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("status", "scheduled")
      .gt("scheduled_at", new Date().toISOString());
    if (countError) throw new Error(`Failed to check schedule cap: ${countError.message}`);
    if ((pendingCount ?? 0) >= MCP_SCHEDULE_CAP) {
      throw new Error(
        `Schedule cap reached: ${pendingCount} newsletters already scheduled (cap is ${MCP_SCHEDULE_CAP}). ` +
          `Ask the user to review/cancel pending sends at ${CALENDAR_URL} before scheduling more. ` +
          `If the user explicitly wants to exceed the cap, call this tool again with \`force: true\`.`,
      );
    }
  }

  // Load article + newsletter_data to build the HTML payload exactly the
  // way the Calendar UI does (Calendar.tsx schedule-newsletter branch).
  const { data: article, error: artErr } = await ctx.admin
    .from("articles")
    .select("id, title, newsletter_data")
    .eq("user_id", ctx.userId)
    .eq("id", articleId)
    .single();
  if (artErr) throw new Error(`Failed to load article: ${artErr.message}`);
  if (!article) throw new Error("Article not found");

  const newsletterData = (article as any).newsletter_data;
  if (!newsletterData || (!newsletterData.html && !newsletterData.body)) {
    throw new Error(
      "Article has no newsletter_data. Open the article in the Content Lab editor → Newsletter tab to generate the newsletter content first, then call this tool again.",
    );
  }

  const bodyHtml: string = newsletterData.html || newsletterData.body || "";
  const subject: string = args?.subject_line || newsletterData.subject || article.title;
  const previewText: string = args?.preview_text || newsletterData.preview || "";
  const fromName: string = args?.from_name || newsletterData.from_name || "Content Lab";
  const fromEmail: string = args?.from_email || newsletterData.from_email || "";
  const replyTo: string = args?.reply_to || newsletterData.reply_to || fromEmail;

  if (!fromEmail) {
    throw new Error(
      "No `from_email` configured. Pass from_email explicitly or set it in the article's newsletter_data.",
    );
  }

  const html = buildNewsletterHtml({ bodyHtml, previewText, fromName });

  const { data, error } = await ctx.admin
    .from("newsletter_schedules")
    .insert({
      user_id: ctx.userId,
      article_id: articleId,
      subject_line: subject,
      preview_text: previewText,
      html_content: html,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      audience_type: audienceType,
      resend_audience_id: resendAudienceId,
      scheduled_at: when.toISOString(),
      status: "scheduled",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return {
    ...data,
    review_url: CALENDAR_URL,
    note: "Newsletter is a ONE-TIME scheduled send. The cron worker will pick it up at the scheduled time and send via Resend exactly once. Tell the user they can review or cancel at /calendar.",
  };
}

async function cancelNewsletterScheduleHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const id = args?.id;
  if (typeof id !== "string" || id.length === 0) throw new Error("`id` is required");

  const { data, error } = await ctx.admin
    .from("newsletter_schedules")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("status", "scheduled")
    .select("id, status, scheduled_at")
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Schedule not found, not yours, or no longer in 'scheduled' state.");
  return { ...data, review_url: CALENDAR_URL };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

type Handler = (args: any, ctx: AuthContext) => Promise<unknown>;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: Handler;
}

const TOOLS: ToolDef[] = [
  {
    name: "create_article",
    description:
      "Start generating a new SEO-ready article (1,500–2,000 words) from a topic, grounded in current web data via Perplexity. A photorealistic cover image is generated automatically via DALL-E 3 once the article is saved. Costs 10 Content Lab credits total (5 for the article + 5 for the cover image). Returns IMMEDIATELY with status: started — generation runs in the background and typically completes in 90–150 seconds end-to-end. Call `list_articles` after ~2 minutes to see the finished article (with its cover_image_url populated) in the user's library.",
    inputSchema: {
      type: "object",
      required: ["topic"],
      properties: {
        topic: { type: "string", description: "Article topic or working title." },
        tone: {
          type: "string",
          enum: ["Informative", "Casual", "Professional", "Witty", "Authoritative"],
          default: "Informative",
        },
        tone_description: { type: "string" },
        category: { type: "string" },
        content_type: {
          type: "string",
          enum: ["blog", "landing", "comparison", "how-to"],
          default: "blog",
        },
        app_description: { type: "string", description: "Optional product context the article should reflect." },
        app_audience: { type: "string", description: "Optional target audience description." },
        reference_urls: {
          type: "array",
          items: { type: "string", format: "uri" },
          description: "Optional reference URLs whose style/voice should be emulated.",
        },
      },
    },
    handler: createArticleHandler,
  },
  {
    name: "list_articles",
    description:
      "List the authenticated user's Content Lab articles, newest first. Body content is NOT included here to keep responses compact — call `get_article` with an id to fetch the full HTML content plus meta.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        status: { type: "string", enum: ["draft", "published", "scheduled", "archived"] },
      },
    },
    handler: listArticlesHandler,
  },
  {
    name: "get_article",
    description:
      "Fetch a single article by id, including the full HTML `content`, `meta_description`, `excerpt`, `cover_image_url`, `article_meta` (SEO keywords, FAQs, etc.), and `url_path`. Use this to read what was actually generated before writing social copy, editing, or publishing.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid", description: "Article UUID from `list_articles`." },
      },
    },
    handler: getArticleHandler,
  },
  {
    name: "update_article",
    description:
      "Edit an existing article. Supports partial updates — only pass the fields you want to change. Fields: title, content (HTML), excerpt, meta_description, category, content_type, status (draft|published|scheduled|archived), cover_image_url. When `content` changes, `reading_time_minutes` is recomputed automatically. Slug and sync metadata (WordPress/Intercom ids) are server-controlled and not editable via this tool.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid" },
        title: { type: "string" },
        content: { type: "string", description: "Full HTML body." },
        excerpt: { type: "string" },
        meta_description: { type: "string", description: "<=150 chars recommended for SEO." },
        category: { type: "string" },
        content_type: { type: "string", enum: ["blog", "landing", "comparison", "how-to", "user_guide"] },
        status: { type: "string", enum: ["draft", "published", "scheduled", "archived"] },
        cover_image_url: { type: "string", format: "uri" },
      },
    },
    handler: updateArticleHandler,
  },
  {
    name: "list_social_posts",
    description:
      "List the authenticated user's social posts (drafted, scheduled, posted, or failed), newest first. The response includes a `review_url` pointing at the user's Content Lab calendar (https://www.app.content-lab.ie/calendar) — surface this URL so the user can review, edit, or cancel scheduled posts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        status: { type: "string", enum: ["draft", "scheduled", "posted", "failed"] },
        platform: { type: "string", enum: ["linkedin"] },
      },
    },
    handler: listSocialPostsHandler,
  },
  {
    name: "schedule_social_post",
    description:
      "Schedule a LinkedIn post for future auto-publishing. The Content Lab cron worker (process-scheduled-posts) picks up due rows every minute and posts via the LinkedIn UGC API. Requires the user to have connected LinkedIn in Settings → Integrations. A safety cap limits each user to 5 future-scheduled posts at a time; if exceeded, the tool errors unless `force: true` is passed. Always tell the user they can review or cancel scheduled posts at https://www.app.content-lab.ie/calendar.",
    inputSchema: {
      type: "object",
      required: ["platform", "content", "scheduled_at"],
      properties: {
        platform: { type: "string", enum: ["linkedin"], description: "Only `linkedin` is supported in v1." },
        content: { type: "string", description: "Post body text." },
        scheduled_at: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 datetime. Must be in the future.",
        },
        article_id: {
          type: "string",
          format: "uuid",
          description: "Optional source article whose URL is attached as a link preview.",
        },
        force: {
          type: "boolean",
          default: false,
          description:
            "Set to true to bypass the 5-post schedule cap. Only pass this when the user has explicitly asked to schedule more than 5 posts in one go.",
        },
      },
    },
    handler: scheduleSocialPostHandler,
  },
  {
    name: "list_newsletter_schedules",
    description:
      "List the authenticated user's newsletter schedules (one-time sends), newest first. Newsletters are NOT recurring — each row has a single `scheduled_at` timestamp and is sent exactly once. Response includes a `review_url` deep-link to https://www.app.content-lab.ie/calendar so the user can review, reschedule, or cancel.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        status: { type: "string", enum: ["scheduled", "sending", "sent", "failed", "cancelled"] },
      },
    },
    handler: listNewsletterSchedulesHandler,
  },
  {
    name: "schedule_newsletter",
    description:
      "Schedule a one-time newsletter send for an existing article that has newsletter_data populated. The send happens ONCE at `scheduled_at` — there is no recurrence; do NOT tell the user this is a recurring automation. The cron worker (process-newsletter-queue) picks up due rows every 5 minutes and sends via Resend. Audience is either the user's contacts table (`audience_type='contacts'`) or a Resend audience id (`audience_type='resend_list'` + `resend_audience_id`). Same 5-per-user safety cap as schedule_social_post; pass `force: true` to override. Always tell the user they can review or cancel at https://www.app.content-lab.ie/calendar.",
    inputSchema: {
      type: "object",
      required: ["article_id", "scheduled_at"],
      properties: {
        article_id: { type: "string", format: "uuid", description: "Article id (must have newsletter_data set)." },
        scheduled_at: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 datetime, must be in the future. One-time send.",
        },
        audience_type: {
          type: "string",
          enum: ["contacts", "resend_list"],
          default: "contacts",
          description: "`contacts` = the user's newsletter_contacts table. `resend_list` = a Resend audience.",
        },
        resend_audience_id: {
          type: "string",
          description: "Required when audience_type='resend_list'. The Resend audience UUID.",
        },
        subject_line: { type: "string", description: "Override the article's default subject." },
        preview_text: { type: "string", description: "Inbox preview text shown next to the subject." },
        from_name: { type: "string" },
        from_email: { type: "string", format: "email" },
        reply_to: { type: "string", format: "email" },
        force: {
          type: "boolean",
          default: false,
          description: "Set to true to bypass the 5-newsletter schedule cap. Only when the user explicitly asked.",
        },
      },
    },
    handler: scheduleNewsletterHandler,
  },
  {
    name: "cancel_newsletter_schedule",
    description:
      "Cancel a one-time newsletter that's still in 'scheduled' state. Marks it as cancelled (kept in history). Errors if the row is already sent, sending, failed, or cancelled.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid", description: "newsletter_schedules.id" },
      },
    },
    handler: cancelNewsletterScheduleHandler,
  },
];

// ---------------------------------------------------------------------------
// JSON-RPC routing
// ---------------------------------------------------------------------------

function rpcResult(id: any, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handleInitialize(id: any, params: any) {
  const protocolVersion = params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  return rpcResult(id, {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  });
}

function handleToolsList(id: any) {
  return rpcResult(id, {
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  });
}

async function handleToolsCall(id: any, params: any, ctx: AuthContext) {
  const name = params?.name;
  if (!name) return rpcError(id, RPC_INVALID_PARAMS, "Missing tool `name`");

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return rpcResult(id, {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    });
  }

  try {
    const result = await tool.handler(params.arguments ?? {}, ctx);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: false,
    });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return rpcResult(id, {
      content: [{ type: "text", text }],
      isError: true,
    });
  }
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcError(null, RPC_PARSE_ERROR, "Invalid JSON body"));
  }

  // JSON-RPC batch — handle each request, drop notifications.
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((msg) => routeMessage(msg, auth)))).filter(
      (r) => r !== null,
    );
    if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders });
    return jsonResponse(responses);
  }

  const response = await routeMessage(body, auth);
  if (response === null) return new Response(null, { status: 202, headers: corsHeaders });
  return jsonResponse(response);
});

async function routeMessage(msg: any, ctx: AuthContext): Promise<any | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id ?? null, RPC_INVALID_REQUEST, "Invalid JSON-RPC request");
  }

  const isNotification = msg.id === undefined || msg.id === null;
  const { id, method, params } = msg;

  try {
    switch (method) {
      case "initialize":
        return handleInitialize(id, params);

      case "notifications/initialized":
      case "notifications/cancelled":
        // JSON-RPC notification: no response.
        return null;

      case "ping":
        return rpcResult(id, {});

      case "tools/list":
        return handleToolsList(id);

      case "tools/call":
        return await handleToolsCall(id, params, ctx);

      // Stubbed capabilities — return empty so probing clients don't see -32601.
      case "resources/list":
        return rpcResult(id, { resources: [] });
      case "prompts/list":
        return rpcResult(id, { prompts: [] });

      default:
        if (isNotification) return null;
        return rpcError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return rpcError(id ?? null, RPC_INTERNAL_ERROR, text);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
