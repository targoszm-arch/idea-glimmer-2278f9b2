import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Patch WebSocket at module level before framer-api is imported
const WS_PROTOCOL_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OrigWS = globalThis.WebSocket;
if (OrigWS) {
  // @ts-expect-error override global
  globalThis.WebSocket = function PatchedWebSocket(
    url: string | URL,
    protocols?: string | string[]
  ) {
    const raw = typeof url === "string" ? url : url.toString();
    const fixedUrl = raw.startsWith("https://")
      ? `wss://${raw.slice("https://".length)}`
      : raw.startsWith("http://")
        ? `ws://${raw.slice("http://".length)}`
        : raw;
    const sanitize = (p: string) => (WS_PROTOCOL_TOKEN.test(p) ? p : undefined);
    if (Array.isArray(protocols)) {
      const cleaned = protocols.map(sanitize).filter(Boolean) as string[];
      return cleaned.length ? new OrigWS(fixedUrl, cleaned) : new OrigWS(fixedUrl);
    }
    if (typeof protocols === "string") {
      const cleaned = sanitize(protocols);
      return cleaned ? new OrigWS(fixedUrl, cleaned) : new OrigWS(fixedUrl);
    }
    return new OrigWS(fixedUrl);
  };
  Object.setPrototypeOf(globalThis.WebSocket, OrigWS);
  globalThis.WebSocket.prototype = OrigWS.prototype;
}

function env(name: string) {
  const v = Deno.env.get(name);
  return v && v.trim().length ? v.trim() : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { framer_item_id, slug } = await req.json();
    if (!framer_item_id && !slug) {
      return new Response(
        JSON.stringify({ error: "framer_item_id or slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Framer credentials from user's integration
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: integration } = await adminSupabase
      .from("user_integrations")
      .select("access_token, platform_user_name, metadata")
      .eq("user_id", user.id)
      .eq("platform", "framer")
      .single();

    const FRAMER_PROJECT_URL = (integration?.metadata as any)?.project_url
      ?? integration?.platform_user_name
      ?? env("FRAMER_PROJECT_URL");
    const FRAMER_API_KEY = (integration?.metadata as any)?.api_key
      ?? (integration?.access_token !== "plugin-managed" ? integration?.access_token : null)
      ?? env("FRAMER_API_TOKEN");
    const FRAMER_COLLECTION_ID = (integration?.metadata as any)?.collection_id
      ?? env("FRAMER_COLLECTION_ID");

    if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY || !FRAMER_COLLECTION_ID) {
      return new Response(JSON.stringify({ ok: true, message: "Skipped — no Framer credentials available." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { connect } = await import("https://esm.sh/framer-api@0.1.2");
    const framer = await connect(FRAMER_PROJECT_URL, FRAMER_API_KEY);

    try {
      const collections = await framer.getCollections();
      const collection = collections.find((c: any) => c.id === FRAMER_COLLECTION_ID);
      if (!collection) {
        throw new Error(`Collection ${FRAMER_COLLECTION_ID} not found`);
      }

      // Resolve the item ID: use framer_item_id directly, or look up by slug
      let resolvedId = framer_item_id;
      if (!resolvedId && slug) {
        const items = await collection.getItems();
        const found = items.find((it: any) => it.slug === slug);
        if (found?.id) {
          resolvedId = found.id;
        } else {
          return new Response(
            JSON.stringify({ ok: true, message: "No matching item found in Framer" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      await collection.removeItems([resolvedId]);

      return new Response(
        JSON.stringify({ ok: true, removed: resolvedId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      await framer.disconnect();
    }
  } catch (error) {
    console.error("delete-from-framer error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
