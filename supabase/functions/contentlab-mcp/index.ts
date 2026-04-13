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
// credit deduction, Perplexity wiring, and DB insert all stay in one place.
// We use the service role key + user_id_override (the path generate-article
// already supports for automation runners), since `cl_` keys aren't valid
// Bearer tokens for that function.
async function createArticleHandler(args: any, ctx: AuthContext): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!args?.topic || typeof args.topic !== "string") {
    throw new Error("`topic` is required and must be a string");
  }

  const body = { ...args, user_id_override: ctx.userId };

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-article`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }

  if (!res.ok) {
    if (parsed?.code === "NO_CREDITS") {
      throw new Error("Insufficient credits — purchase more in Settings → Billing");
    }
    const msg = parsed?.error ?? `generate-article returned ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return parsed;
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
      "Generate a new SEO-ready article (1,500–2,000 words) from a topic, grounded in current web data via Perplexity. Costs 5 Content Lab credits. Returns the saved article with id, title, slug, and content.",
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
