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

type AuthContext = { userId: string; admin: SupabaseClient; token: string };

// ---------------------------------------------------------------------------
// Auth — copied from framer-sync-articles/index.ts (lines 12-54)
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
  } else {
    // JWT path — useful for local testing with `supabase functions invoke`.
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    userId = user.id;
  }

  return { userId: userId!, admin, token };
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

      // Parse meta JSON block and strip it from content
      let articleMeta: Record<string, unknown> | null = null;
      let metaDescription = "";
      const metaMatch = html.match(/<!--\s*META_JSON_START([\s\S]*?)META_JSON_END\s*-->/);
      if (metaMatch) {
        try {
          articleMeta = JSON.parse(metaMatch[1].trim());
          const md = articleMeta?.meta_description;
          if (typeof md === "string") metaDescription = md;
        } catch (e) {
          console.warn(`[create_article] meta JSON parse failed for user ${ctx.userId}:`, e);
        }
      }

      // Clean: strip meta block, strip any leftover code fences, strip inline styles.
      const cleanContent = html
        .replace(/<!--\s*META_JSON_START[\s\S]*?META_JSON_END\s*-->/g, "")
        .replace(/^```html\s*|\s*```\s*$/g, "")
        .replace(/\s*style="[^"]*"/gi, "")
        .trim();

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
  return { count: data?.length ?? 0, posts: data ?? [] };
}

async function scheduleSocialPostHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const platform = args?.platform;
  const content = args?.content;
  const scheduledAt = args?.scheduled_at;
  const articleId = args?.article_id ?? null;

  if (platform !== "linkedin") throw new Error("Only `platform: linkedin` is supported in v1");
  if (typeof content !== "string" || content.trim().length === 0) throw new Error("`content` is required");
  if (typeof scheduledAt !== "string") throw new Error("`scheduled_at` is required (ISO 8601)");

  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) throw new Error("`scheduled_at` is not a valid ISO 8601 datetime");
  if (when.getTime() <= Date.now()) throw new Error("`scheduled_at` must be in the future");

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
  return data;
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
    description: "List the authenticated user's Content Lab articles, newest first.",
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
    name: "list_social_posts",
    description: "List the authenticated user's social posts (drafted, scheduled, posted, or failed), newest first.",
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
      "Schedule a LinkedIn post for future auto-publishing. The Content Lab cron worker (process-scheduled-posts) picks up due rows every minute and posts via the LinkedIn UGC API. Requires the user to have connected LinkedIn in Settings → Integrations.",
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
      },
    },
    handler: scheduleSocialPostHandler,
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
