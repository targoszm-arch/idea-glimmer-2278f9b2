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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, mcp-protocol-version",
  // MCP clients (Claude) read `WWW-Authenticate` on 401 responses to learn
  // where to fetch the protected-resource and authorization-server metadata.
  // Without this expose header, browser-based clients silently can't see it
  // and surface a generic "Couldn't reach the MCP server" error.
  "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id, mcp-protocol-version",
};

// JSON-RPC 2.0 error codes
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
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

type AuthMethod = "api_key" | "oauth" | "jwt";
type AuthContext = {
  userId: string;
  admin: SupabaseClient;
  token: string;
  authMethod: AuthMethod;
  // Populated for OAuth tokens (the client_id claim from the access token).
  oauthClientId?: string;
};

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
  let authMethod: AuthMethod = "api_key";
  let oauthClientId: string | undefined;

  if (token.startsWith("cl_")) {
    const { data: keyData } = await admin
      .from("api_keys")
      .select("user_id")
      .eq("key", token)
      .single();

    if (!keyData) return jsonResponse({ error: "Invalid API key" }, 401);

    userId = keyData.user_id;
    authMethod = "api_key";
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", token);
  } else if (isLikelyJwt(token)) {
    // Try MCP OAuth access token first. If that fails (wrong issuer, bad
    // signature), fall back to Supabase JWT so `supabase functions invoke`
    // local testing still works.
    const oauthClaims = await verifyMcpOAuthToken(token);
    if (oauthClaims) {
      userId = oauthClaims.sub;
      oauthClientId = oauthClaims.cid;
      authMethod = "oauth";
    } else {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anon.auth.getUser();
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = user.id;
      authMethod = "jwt";
    }
  } else {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { userId: userId!, admin, token, authMethod, oauthClientId };
}

function isLikelyJwt(token: string): boolean {
  return token.split(".").length === 3;
}

// Verifies an MCP OAuth access token (HS256 JWT issued by mcp-oauth-token).
// Returns the verified claims (sub + cid) on success, or null on any failure.
async function verifyMcpOAuthToken(
  token: string,
): Promise<{ sub: string; cid?: string } | null> {
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
    // Accept both the old issuer (SUPABASE_URL) and the new one (MCP_URL)
    // so tokens issued before this change still work.
    const validIssuers = [
      "https://rnshobvpqegttrpaowxe.supabase.co",
      "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp",
    ];
    if (!validIssuers.includes(payload.iss)) return null;
    if (payload.aud !== "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp") {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

    return { sub: payload.sub, cid: typeof payload.cid === "string" ? payload.cid : undefined };
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

  // Insert a placeholder row BEFORE detaching so the caller gets an
  // article_id immediately and can poll with get_article. If the
  // background generation fails, the row is updated with
  // generation_status='failed' + generation_error instead of vanishing.
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: placeholder, error: placeholderErr } = await admin
    .from("articles")
    .insert({
      user_id: ctx.userId,
      title: args.topic.slice(0, 200),
      slug: `generating-${Date.now()}`,
      content: "",
      excerpt: "",
      category: args.category ?? "",
      content_type: args.content_type ?? "blog",
      status: "draft",
      generation_status: "generating",
    })
    .select("id")
    .single();

  if (placeholderErr || !placeholder) {
    throw new Error(`Failed to create placeholder article: ${placeholderErr?.message ?? "unknown"}`);
  }

  const articleId = placeholder.id;

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
        await markGenerationFailed(admin, articleId, `generate-article returned ${res.status}: ${errText.slice(0, 200)}`);
        return;
      }
      if (!res.body) {
        await markGenerationFailed(admin, articleId, "No response body from generate-article");
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
        await markGenerationFailed(admin, articleId, "AI returned empty content");
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

      // Capture inline-image / infographic prompts BEFORE cleaning the HTML —
      // we'll use them after saving to call the image generation endpoints.
      const inlineImagePromptMatch = args?.include_inline_image === true
        ? html.match(/<!--\s*INLINE_IMAGE_PROMPT:\s*([\s\S]*?)\s*-->/i)
        : null;
      const infographicPromptMatch = args?.include_infographic === true
        ? html.match(/<!--\s*INFOGRAPHIC_PROMPT:\s*([\s\S]*?)\s*-->/i)
        : null;
      const infographicStyleMatch = args?.include_infographic === true
        ? html.match(/<!--\s*INFOGRAPHIC_STYLE:\s*(stats|comparison|timeline|process|general)\s*-->/i)
        : null;

      // Clean: strip meta comment blocks, code fences, inline styles, any
      // stray <script> blocks the model may have emitted despite the prompt.
      // Strip the *_PROMPT comments too (they leaked the prompt to readers).
      // Keep *_HERE placeholders — they're substituted with <img> tags below.
      const cleanedHtml = html
        .replace(/<!--\s*META_TITLE:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*META_DESCRIPTION:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*COVER_IMAGE_PROMPT:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*INLINE_IMAGE_PROMPT:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*INFOGRAPHIC_PROMPT:[\s\S]*?-->/gi, "")
        .replace(/<!--\s*INFOGRAPHIC_STYLE:[\s\S]*?-->/gi, "")
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
        title,
        slug,
        content: cleanContent,
        excerpt,
        meta_description: metaDescription.slice(0, 150),
        category: args.category ?? "",
        content_type: args.content_type ?? "blog",
        status: "draft",
        reading_time_minutes: readingTime,
        generation_status: "complete",
        generation_error: null,
      };
      if (articleMeta) payload.article_meta = articleMeta;

      const { error } = await admin.from("articles").update(payload).eq("id", articleId);
      if (error) {
        await markGenerationFailed(admin, articleId, `DB update failed: ${error.message}`);
        return;
      }
      const data = { id: articleId };
      console.log(`[create_article] saved article ${data.id} (${title}) for user ${ctx.userId}`);

      // Cover image is opt-in via `generate_cover_image: true`. Anthropic's
      // connector-directory policy prohibits AI media generation by default,
      // so we only call DALL-E when the user (via Claude) explicitly asked.
      // The web-app "Create article" flow has its own path and is unaffected.
      if (args?.generate_cover_image === true) {
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
      } else {
        console.log(`[create_article] skipping cover image for article ${data.id} (opt-in flag not set)`);
      }

      // Inline image + infographic generation (mirrors NewArticle.tsx). Best-
      // effort: any failure is logged but doesn't fail the article. Both run
      // in parallel. The article is then UPDATEd with the substituted HTML.
      const inlinePrompt = inlineImagePromptMatch?.[1]?.trim();
      const infographicPrompt = infographicPromptMatch?.[1]?.trim();
      const infographicStyle = infographicStyleMatch?.[1]?.toLowerCase() || "general";

      if (inlinePrompt || infographicPrompt) {
        try {
          const contextSnippet = plainText.slice(0, 500);
          const inlineReq = inlinePrompt
            ? fetch(`${supabaseUrl}/functions/v1/generate-cover-image`, {
                method: "POST",
                headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: inlinePrompt, context: contextSnippet, user_id_override: ctx.userId }),
              }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
            : Promise.resolve(null);
          const infoReq = infographicPrompt
            ? fetch(`${supabaseUrl}/functions/v1/generate-infographic`, {
                method: "POST",
                headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: infographicPrompt, style: infographicStyle, user_id_override: ctx.userId }),
              }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
            : Promise.resolve(null);

          const [inlineRes, infoRes] = await Promise.all([inlineReq, infoReq]);

          const escapeAttr = (s: string) => s.replace(/"/g, "&quot;");
          const imgTag = (url: string, alt: string) => `<img src="${url}" alt="${escapeAttr(alt)}" />`;

          const insertAtFallback = (htmlStr: string, tag: string, kind: "inline" | "info"): string => {
            if (kind === "info") {
              const faqMatch = htmlStr.match(/<h2[^>]*id="faqs"[^>]*>|<h2[^>]*>[^<]*Frequently Asked/i);
              if (faqMatch && faqMatch.index !== undefined) {
                return htmlStr.slice(0, faqMatch.index) + tag + "\n" + htmlStr.slice(faqMatch.index);
              }
            }
            const firstSection = htmlStr.match(/<\/h2>[\s\S]*?<\/p>/i);
            if (firstSection && firstSection.index !== undefined) {
              const insertAt = firstSection.index + firstSection[0].length;
              return htmlStr.slice(0, insertAt) + "\n" + tag + htmlStr.slice(insertAt);
            }
            return htmlStr + "\n" + tag;
          };

          let updated = cleanContent;

          if (inlineRes?.image_url) {
            const tag = imgTag(inlineRes.image_url, inlinePrompt || "Article image");
            updated = /<!--\s*INLINE_IMAGE_HERE\s*-->/i.test(updated)
              ? updated.replace(/<!--\s*INLINE_IMAGE_HERE\s*-->/i, tag)
              : insertAtFallback(updated, tag, "inline");
            console.log(`[create_article] inline image attached to article ${data.id}`);
          } else if (inlinePrompt) {
            console.warn(`[create_article] inline image failed for article ${data.id}:`, inlineRes?.error || "no image_url");
          }

          if (infoRes?.image_url) {
            const tag = imgTag(infoRes.image_url, infographicPrompt || "Infographic");
            updated = /<!--\s*INFOGRAPHIC_HERE\s*-->/i.test(updated)
              ? updated.replace(/<!--\s*INFOGRAPHIC_HERE\s*-->/i, tag)
              : insertAtFallback(updated, tag, "info");
            console.log(`[create_article] infographic attached to article ${data.id}`);
          } else if (infographicPrompt) {
            console.warn(`[create_article] infographic failed for article ${data.id}:`, infoRes?.error || "no image_url");
          }

          // Strip any leftover *_HERE placeholders that didn't get substituted.
          updated = updated
            .replace(/<!--\s*INLINE_IMAGE_HERE\s*-->/gi, "")
            .replace(/<!--\s*INFOGRAPHIC_HERE\s*-->/gi, "");

          if (updated !== cleanContent) {
            const { error: mediaUpdateErr } = await admin
              .from("articles")
              .update({ content: updated })
              .eq("id", data.id);
            if (mediaUpdateErr) {
              console.warn(`[create_article] media-content update failed for article ${data.id}: ${mediaUpdateErr.message}`);
            }
          }
        } catch (e) {
          console.warn(`[create_article] inline media generation threw for article ${data.id}:`, e);
        }
      }
    } catch (e) {
      console.error(`[create_article] background generation threw for user ${ctx.userId}:`, e);
      await markGenerationFailed(admin, articleId, e instanceof Error ? e.message : "Unknown error");
    }
  })();

  // Detach so the HTTP response returns immediately.
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(generation);

  return {
    status: "started",
    article_id: articleId,
    topic: args.topic,
    message:
      "Article generation started. Call `get_article` with the article_id to check progress — `generation_status` will be 'generating', 'complete', or 'failed'. Typical runtime is 90–150 seconds. If `generate_cover_image: true` was passed, the cover is attached after the article finishes.",
  };
}

async function markGenerationFailed(admin: any, articleId: string, error: string): Promise<void> {
  console.error(`[create_article] generation failed for ${articleId}: ${error}`);
  await admin
    .from("articles")
    .update({ generation_status: "failed", generation_error: error.slice(0, 500) })
    .eq("id", articleId);
}

async function listArticlesHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const limit = clampInt(args?.limit, 1, 200, 50);

  let query = ctx.admin
    .from("articles")
    .select("id, title, slug, status, content_type, category, generation_status, generation_error, created_at, updated_at")
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
      "id, title, slug, content, excerpt, meta_description, category, content_type, status, cover_image_url, reading_time_minutes, article_meta, url_path, generation_status, generation_error, created_at, updated_at",
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
  const resendSegmentId = args?.resend_segment_id ?? null;
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
      resend_segment_id: resendSegmentId,
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

// generate_newsletter_data — calls the existing generate-newsletter edge
// function and saves the result to articles.newsletter_data. After this,
// schedule_newsletter can send it without the user touching the UI.
async function generateNewsletterDataHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const articleId = args?.article_id;
  if (typeof articleId !== "string" || articleId.length === 0) {
    throw new Error("`article_id` is required");
  }

  const { data: article, error: artErr } = await ctx.admin
    .from("articles")
    .select("id, title, content, excerpt, category, cover_image_url, newsletter_data, url_path, slug")
    .eq("user_id", ctx.userId)
    .eq("id", articleId)
    .single();

  if (artErr) throw new Error(`Failed to load article: ${artErr.message}`);
  if (!article) throw new Error("Article not found");

  if ((article as any).newsletter_data && args?.force !== true) {
    return {
      article_id: articleId,
      newsletter_data: (article as any).newsletter_data,
      note: "Newsletter data already exists. Pass `force: true` to regenerate.",
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-newsletter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      category: article.category,
      cover_image_url: article.cover_image_url,
      cta_text: args?.cta_text || "Read the full article",
      cta_url: args?.cta_url || `${APP_URL}${(article as any).url_path || `/${article.slug}`}`,
      brand_name: args?.brand_name || "Content Lab",
    }),
  });

  const data = await res.json();
  if (!data.ok || !data.newsletter) {
    throw new Error(data.error || "generate-newsletter returned an error");
  }

  await ctx.admin
    .from("articles")
    .update({ newsletter_data: data.newsletter })
    .eq("id", articleId);

  return {
    article_id: articleId,
    newsletter_data: data.newsletter,
    note: "Newsletter data generated and saved. You can now call `schedule_newsletter` to send it.",
  };
}

// update_newsletter_data — partial merge into articles.newsletter_data.
// Accepts any subset of the newsletter fields; unspecified fields are
// left untouched. Requires an existing newsletter_data row — call
// generate_newsletter_data first if the article has never had one.
async function updateNewsletterDataHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const articleId = args?.article_id;
  if (typeof articleId !== "string" || articleId.length === 0) {
    throw new Error("`article_id` is required");
  }

  const { data: article, error: loadErr } = await ctx.admin
    .from("articles")
    .select("id, newsletter_data")
    .eq("user_id", ctx.userId)
    .eq("id", articleId)
    .single();

  if (loadErr) throw new Error(`Failed to load article: ${loadErr.message}`);
  if (!article) throw new Error("Article not found");

  const existing = (article as any).newsletter_data;
  if (!existing || typeof existing !== "object") {
    throw new Error(
      "This article has no newsletter_data yet. Call `generate_newsletter_data` first.",
    );
  }

  // Surgical merge — only pull fields the caller explicitly passed. Using
  // `in args` (not a truthy check) so Claude can legitimately pass an empty
  // string to clear a field.
  const editableFields = [
    "subject_line",
    "preview_text",
    "greeting",
    "opening_hook",
    "sections",
    "what_this_means",
    "cta_text",
    "cta_url",
    "closing",
    "signoff",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of editableFields) {
    if (key in args) patch[key] = args[key];
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(
      "No editable fields provided. Pass at least one of: " +
        editableFields.join(", "),
    );
  }

  // Light validation on `sections` so a malformed array doesn't corrupt
  // the stored JSON.
  if ("sections" in patch) {
    if (!Array.isArray(patch.sections)) {
      throw new Error("`sections` must be an array");
    }
    for (const [i, s] of (patch.sections as any[]).entries()) {
      if (!s || typeof s !== "object") {
        throw new Error(`sections[${i}] must be an object`);
      }
      if (typeof s.heading !== "string" || typeof s.body !== "string") {
        throw new Error(`sections[${i}] requires string heading + body`);
      }
    }
  }

  const merged = { ...existing, ...patch };

  const { error: updErr } = await ctx.admin
    .from("articles")
    .update({ newsletter_data: merged })
    .eq("id", articleId);

  if (updErr) throw new Error(`Failed to update newsletter_data: ${updErr.message}`);

  return {
    article_id: articleId,
    newsletter_data: merged,
    updated_fields: Object.keys(patch),
  };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

type Handler = (args: any, ctx: AuthContext) => Promise<unknown>;

// MCP tool annotations — surfaced to Claude during tools/list so the model
// can reason about whether a tool is safe to auto-call. Required by the
// Anthropic connector directory. See:
//   https://modelcontextprotocol.io/specification/2025-06-18/server/tools
interface ToolAnnotations {
  // Human-readable name, shown in the UI. Separate from the snake_case tool name.
  title?: string;
  // True = tool does not modify state. Claude can call freely.
  readOnlyHint?: boolean;
  // True = tool can irreversibly delete or overwrite user data.
  destructiveHint?: boolean;
  // True = calling the same tool twice with the same args has the same effect.
  idempotentHint?: boolean;
  // True = tool interacts with external systems (LinkedIn, email, etc).
  openWorldHint?: boolean;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  handler: Handler;
}

const TOOLS: ToolDef[] = [
  {
    name: "create_article",
    description:
      "Start generating a new SEO-ready article (1,500–2,000 words) from a topic, grounded in current web data via Perplexity. Costs 5 Content Lab credits for the article text. Returns IMMEDIATELY with status: started — generation runs in the background and typically completes in 90–150 seconds. Call `list_articles` after ~2 minutes to see the finished article in the user's library. Image generation is opt-in: `generate_cover_image: true` adds a DALL-E 3 cover (+5 credits), `include_inline_image: true` adds a DALL-E 3 inline image inside the article body (+5 credits), `include_infographic: true` adds a DALL-E 3 infographic (+5 credits). All three are off by default — only pass true when the user explicitly asked for an image. Users can always add or change images later from the Content Lab editor.",
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
        generate_cover_image: {
          type: "boolean",
          default: false,
          description:
            "Set to true to additionally generate a cover image via DALL-E 3 (adds 5 credits). Off by default — only pass true when the user explicitly asked for an image.",
        },
        include_inline_image: {
          type: "boolean",
          default: false,
          description:
            "Set to true to insert an AI-generated inline image (DALL-E 3) inside the article body. Adds 5 credits. The model places the image at a relevant point in the article.",
        },
        include_infographic: {
          type: "boolean",
          default: false,
          description:
            "Set to true to insert an AI-generated infographic (DALL-E 3) inside the article body. Adds 5 credits. The infographic style is auto-selected from the article topic (stats, comparison, timeline, process, or general).",
        },
      },
    },
    annotations: {
      title: "Create article",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
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
    annotations: {
      title: "List articles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    annotations: {
      title: "Get article",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    annotations: {
      title: "Update article",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
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
    annotations: {
      title: "List social posts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    annotations: {
      title: "Schedule LinkedIn post",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
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
    annotations: {
      title: "List newsletter schedules",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
        resend_segment_id: {
          type: "string",
          description: "Optional Resend segment UUID. When provided alongside resend_audience_id, the send targets only contacts in that segment (e.g. 'Stripe Trials'). Requires audience_type='resend_list'.",
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
    annotations: {
      title: "Schedule newsletter send",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: scheduleNewsletterHandler,
  },
  {
    name: "generate_newsletter_data",
    description:
      "Generate email-ready newsletter data from an existing article. Calls the AI to produce a structured newsletter (subject_line, preview_text, greeting, sections, CTA) and saves it to the article. After this, call `schedule_newsletter` to send it. If the article already has newsletter_data, returns it immediately — pass `force: true` to regenerate.",
    inputSchema: {
      type: "object",
      required: ["article_id"],
      properties: {
        article_id: { type: "string", format: "uuid", description: "Article UUID." },
        cta_text: { type: "string", description: "CTA button text (default: 'Read the full article')." },
        cta_url: { type: "string", format: "uri", description: "CTA link URL (defaults to article's public URL)." },
        brand_name: { type: "string", description: "Brand name shown in the email (defaults to 'Content Lab')." },
        force: {
          type: "boolean",
          default: false,
          description: "Set to true to regenerate even if newsletter_data already exists.",
        },
      },
    },
    annotations: {
      title: "Generate newsletter data",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: generateNewsletterDataHandler,
  },
  {
    name: "update_newsletter_data",
    description:
      "Edit one or more fields of an article's newsletter_data (subject_line, preview_text, sections, CTA, etc). Accepts a partial object — any fields you include replace the existing ones; anything you omit is left as-is. Requires the article to already have newsletter_data (call generate_newsletter_data first if not).",
    inputSchema: {
      type: "object",
      required: ["article_id"],
      properties: {
        article_id: { type: "string", format: "uuid", description: "Article UUID." },
        subject_line: { type: "string", description: "Email subject line." },
        preview_text: { type: "string", description: "Inbox preview text (first ~90 chars visible under subject)." },
        greeting: { type: "string", description: "Opening salutation, e.g. 'Hi there,'." },
        opening_hook: { type: "string", description: "Lead paragraph / hook." },
        sections: {
          type: "array",
          description: "Body sections. Each section must include heading + body; bullets is optional.",
          items: {
            type: "object",
            required: ["heading", "body"],
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
            },
          },
        },
        what_this_means: { type: "string", description: "Takeaway / implications paragraph." },
        cta_text: { type: "string", description: "CTA button label." },
        cta_url: { type: "string", format: "uri", description: "CTA destination URL." },
        closing: { type: "string", description: "Closing line above the sign-off." },
        signoff: { type: "string", description: "Sign-off line, e.g. 'Talk soon,\\nThe team'." },
      },
    },
    annotations: {
      title: "Edit newsletter content",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: updateNewsletterDataHandler,
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
    annotations: {
      title: "Cancel newsletter schedule",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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
    tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      ...(annotations ? { annotations } : {}),
    })),
  });
}

// JSON-RPC custom error code for rate-limit rejection. Picked from the
// implementation-defined server-error range (-32000 to -32099) per the
// JSON-RPC 2.0 spec.
const RPC_RATE_LIMITED = -32000;

// Fields that must never be written to the audit log. arguments JSON is
// passed to the MCP tool by the model, so in principle it's user-visible —
// but we defensively strip anything that looks like a credential in case a
// tool's schema is ever extended with a sensitive field.
const AUDIT_REDACT_KEYS = new Set([
  "password", "token", "access_token", "refresh_token", "secret", "api_key",
  "authorization", "bearer",
]);

function redactArguments(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  if (Array.isArray(args)) return args.map(redactArguments);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (AUDIT_REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactArguments(v);
    }
  }
  return out;
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

  // Per-user rate limit. Default 120 calls/hour, overrideable per-user
  // via mcp_rate_limits.hourly_limit. Uses a SQL helper that counts
  // invocations in the trailing hour.
  const { data: limitRow } = await ctx.admin.rpc("check_mcp_rate_limit", {
    p_user_id: ctx.userId,
  });
  const limit = Array.isArray(limitRow) ? limitRow[0] : limitRow;
  if (limit && limit.allowed === false) {
    // Log the block so we can see when someone hits the ceiling.
    await logInvocation(ctx, name, params?.arguments, "rate_limited", 0, RPC_RATE_LIMITED);
    return rpcError(
      id,
      RPC_RATE_LIMITED,
      `Rate limit exceeded (${limit.hourly_limit}/hour). Retry after ${limit.retry_after_seconds}s.`,
    );
  }

  const startedAt = Date.now();
  try {
    const result = await tool.handler(params.arguments ?? {}, ctx);
    const duration = Date.now() - startedAt;
    await logInvocation(ctx, name, params?.arguments, "ok", duration, null);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: false,
    });
  } catch (e) {
    const duration = Date.now() - startedAt;
    const text = e instanceof Error ? e.message : String(e);
    await logInvocation(ctx, name, params?.arguments, "error", duration, RPC_INTERNAL_ERROR);
    return rpcResult(id, {
      content: [{ type: "text", text }],
      isError: true,
    });
  }
}

// Best-effort audit write. Failures are logged but never surface to the
// caller — logging must not break tool calls.
async function logInvocation(
  ctx: AuthContext,
  toolName: string,
  args: unknown,
  status: "ok" | "error" | "rate_limited",
  durationMs: number,
  errorCode: number | null,
): Promise<void> {
  try {
    const { error } = await ctx.admin.from("mcp_tool_invocations").insert({
      user_id: ctx.userId,
      tool_name: toolName,
      auth_method: ctx.authMethod,
      client_id: ctx.oauthClientId ?? null,
      arguments: redactArguments(args) ?? null,
      status,
      error_code: errorCode,
      duration_ms: durationMs,
    });
    if (error) {
      console.warn(`[mcp_tool_invocations] insert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn("[mcp_tool_invocations] insert threw:", e);
  }
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------

// OAuth discovery constants. ALL discovery metadata is served from this
// function (the MCP URL itself). Claude appends /.well-known/* paths to
// the authorization_servers URL, and Supabase doesn't serve /.well-known
// at the project root — so we MUST handle it here.
const SUPABASE_URL_CONST = "https://rnshobvpqegttrpaowxe.supabase.co";
const APP_URL_CONST = "https://www.app.content-lab.ie";
const MCP_URL_CONST = `${SUPABASE_URL_CONST}/functions/v1/contentlab-mcp`;
const TOKEN_URL_CONST = `${SUPABASE_URL_CONST}/functions/v1/mcp-oauth-token`;
const REGISTER_URL_CONST = `${SUPABASE_URL_CONST}/functions/v1/mcp-oauth-register`;

// The resource_metadata URL points to THIS function's well-known path.
const RESOURCE_METADATA_URL = `${MCP_URL_CONST}/.well-known/oauth-protected-resource`;

// Protected resource metadata (RFC 9728). authorization_servers points to
// the MCP URL itself — Claude will fetch {mcp-url}/.well-known/oauth-
// authorization-server which we also serve below.
const PROTECTED_RESOURCE_META = {
  resource: MCP_URL_CONST,
  authorization_servers: [MCP_URL_CONST],
  scopes_supported: ["mcp"],
  bearer_methods_supported: ["header"],
  resource_documentation: `${APP_URL_CONST}/connect/claude`,
};

// Authorization server metadata (RFC 8414). Issuer = MCP URL so that
// the well-known URL construction resolves back to this same function.
const AUTH_SERVER_META = {
  issuer: MCP_URL_CONST,
  authorization_endpoint: `${APP_URL_CONST}/oauth/authorize`,
  token_endpoint: TOKEN_URL_CONST,
  registration_endpoint: REGISTER_URL_CONST,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["mcp"],
  service_documentation: `${APP_URL_CONST}/connect/claude`,
};

// WWW-Authenticate header for 401 responses.
const WWW_AUTH_HEADER = `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname;

  // ---- OAuth discovery GET endpoints ------------------------------------

  // RFC 9728: protected-resource metadata.
  if (req.method === "GET" && path.endsWith("/.well-known/oauth-protected-resource")) {
    return wellKnownJson(PROTECTED_RESOURCE_META);
  }

  // RFC 8414: authorization-server metadata. Claude fetches this after
  // reading authorization_servers from the protected-resource metadata.
  if (req.method === "GET" && path.endsWith("/.well-known/oauth-authorization-server")) {
    return wellKnownJson(AUTH_SERVER_META);
  }

  // Any other GET → 401 with discovery header (standard MCP auth handshake).
  if (req.method === "GET") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "WWW-Authenticate": WWW_AUTH_HEADER,
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) {
    // Add WWW-Authenticate to auth failures so Claude retries with OAuth
    // even if it sent a bad/expired token.
    const body = await auth.text();
    return new Response(body, {
      status: auth.status,
      headers: {
        ...Object.fromEntries(auth.headers.entries()),
        "WWW-Authenticate": WWW_AUTH_HEADER,
      },
    });
  }

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

function wellKnownJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

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
