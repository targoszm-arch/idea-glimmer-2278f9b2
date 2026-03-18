import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { connect } from "npm:framer-api@0.1.2";
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

function patchWebSocket() {
  const WS_PROTOCOL_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const NativeWS = globalThis.WebSocket;
  if (!NativeWS || (NativeWS as any).__patched) return;

  class PatchedWebSocket extends NativeWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      const raw = typeof url === "string" ? url : url.toString();
      const fixedUrl = raw.startsWith("https://")
        ? `wss://${raw.slice("https://".length)}`
        : raw.startsWith("http://")
          ? `ws://${raw.slice("http://".length)}`
          : raw;

      const sanitize = (p: string) => (WS_PROTOCOL_TOKEN.test(p) ? p : null);

      if (Array.isArray(protocols)) {
        const cleaned = protocols.map((p) => sanitize(p)).filter(Boolean) as string[];
        if (cleaned.length) super(fixedUrl, cleaned);
        else super(fixedUrl);
        return;
      }

      if (typeof protocols === "string") {
        const cleaned = sanitize(protocols);
        if (cleaned) super(fixedUrl, cleaned);
        else super(fixedUrl);
        return;
      }

      super(fixedUrl);
    }
  }
  (PatchedWebSocket as any).__patched = true;
  // @ts-expect-error override global
  globalThis.WebSocket = PatchedWebSocket;
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

    // Framer config
    const FRAMER_PROJECT_URL = env("FRAMER_PROJECT_URL");
    const FRAMER_API_KEY = env("FRAMER_API_KEY") ?? env("FRAMER_API_TOKEN");
    const FRAMER_COLLECTION_ID = env("FRAMER_COLLECTION_ID");

    if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY || !FRAMER_COLLECTION_ID) {
      throw new Error("Missing Framer configuration secrets");
    }

    // Fetch all article slugs from DB
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: articles, error: dbError } = await supabaseService
      .from("articles")
      .select("slug");

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    const dbSlugs = new Set((articles || []).map((a: any) => a.slug));

    // Patch WebSocket right before connecting to Framer
    patchWebSocket();

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
