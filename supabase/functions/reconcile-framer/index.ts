import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function env(name: string) {
  const v = Deno.env.get(name);
  return v && v.trim().length ? v.trim() : null;
}

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
      return cleaned.length
        ? new OrigWS(fixedUrl, cleaned)
        : new OrigWS(fixedUrl);
    }

    if (typeof protocols === "string") {
      const cleaned = sanitize(protocols);
      return cleaned ? new OrigWS(fixedUrl, cleaned) : new OrigWS(fixedUrl);
    }

    return new OrigWS(fixedUrl);
  };
  Object.setPrototypeOf(globalThis.WebSocket, OrigWS);
  Object.defineProperty(globalThis.WebSocket, 'prototype', { value: OrigWS.prototype });
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
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Fetch Framer credentials from user's integration
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: integration, error: intError } = await adminSupabase
      .from("user_integrations")
      .select("access_token, platform_user_name, metadata")
      .eq("user_id", user.id)
      .eq("platform", "framer")
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Framer is not connected. Go to Settings → Integrations." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FRAMER_PROJECT_URL = (integration.metadata as any)?.project_url ?? integration.platform_user_name;
    const FRAMER_API_KEY = (integration.metadata as any)?.api_key ?? integration.access_token;
    const FRAMER_COLLECTION_ID = (integration.metadata as any)?.collection_id ?? env("FRAMER_COLLECTION_ID");

    if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY || FRAMER_API_KEY === "plugin-managed" || !FRAMER_COLLECTION_ID) {
      return new Response(JSON.stringify({ ok: true, message: "Skipped — Framer uses plugin-based sync." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all article slugs from DB
    const { data: articles, error: dbError } = await adminSupabase
      .from("articles")
      .select("slug")
      .eq("user_id", user.id);

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    const dbSlugs = new Set((articles || []).map((a: any) => a.slug));

    // Dynamic import so the WS patch is in place before framer-api captures it
    const { connect } = await import("https://esm.sh/framer-api@0.1.2");
    const framer = await connect(FRAMER_PROJECT_URL, FRAMER_API_KEY);

    try {
      const collections = await framer.getCollections();
      const collection = collections.find((c: any) => c.id === FRAMER_COLLECTION_ID);
      if (!collection) {
        throw new Error(`Collection ${FRAMER_COLLECTION_ID} not found`);
      }

      const items = await collection.getItems();

      // Find orphans: items in Framer whose slug is not in DB
      const orphans = items.filter((item: any) => !dbSlugs.has(item.slug));

      if (orphans.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, removed: 0, slugs: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const orphanIds = orphans.map((o: any) => o.id);
      const orphanSlugs = orphans.map((o: any) => o.slug);

      await collection.removeItems(orphanIds);

      console.log(`Reconcile: removed ${orphans.length} stale items:`, orphanSlugs);

      return new Response(
        JSON.stringify({ ok: true, removed: orphans.length, slugs: orphanSlugs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      await framer.disconnect();
    }
  } catch (error) {
    console.error("reconcile-framer error:", error);
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
