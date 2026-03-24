import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PublishBody = {
  article_id?: string;
  id?: string;
  framer_item_id?: string | null;

  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  meta_description?: string;
  category?: string;
  cover_image_url?: string | null;
};

function env(name: string) {
  const v = Deno.env.get(name);
  return v && v.trim().length ? v.trim() : null;
}

function normalize(s: string) {
  return s.toLowerCase().trim();
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
      return cleaned.length ? new OrigWS(fixedUrl, cleaned) : new OrigWS(fixedUrl);
    }
    if (typeof protocols === "string") {
      const cleaned = sanitize(protocols);
      return cleaned ? new OrigWS(fixedUrl, cleaned) : new OrigWS(fixedUrl);
    }
    return new OrigWS(fixedUrl);
  };
  // framer-api calls ws.postMessage(); Deno WebSocket uses ws.send()
  const OrigProto = OrigWS.prototype;
  if (!OrigProto.postMessage) {
    OrigProto.postMessage = function(data: unknown) {
      this.send(typeof data === "string" ? data : JSON.stringify(data));
    };
  }
  Object.setPrototypeOf(globalThis.WebSocket, OrigWS);
  globalThis.WebSocket.prototype = OrigProto;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Get Framer credentials from user's integration settings (user_integrations table)
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch this user's Framer integration from DB
    const { data: integration } = await adminSupabase
      .from("user_integrations")
      .select("access_token, platform_user_name, metadata")
      .eq("user_id", user.id)
      .eq("platform", "framer")
      .single();

    // Check if this is a plugin-managed integration (no server-side push possible)
    const isPluginManaged = integration?.access_token === "plugin-managed" 
      && !(integration?.metadata as any)?.api_key;

    if (isPluginManaged) {
      return new Response(JSON.stringify({
        error: "plugin_managed",
        message: "Your Framer integration is managed by the plugin. Articles sync automatically when you use the Framer plugin's Sync button."
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve credentials from DB or env
    const FRAMER_PROJECT_URL = (integration?.metadata as any)?.project_url
      ?? integration?.platform_user_name
      ?? env("FRAMER_PROJECT_URL");
    const FRAMER_API_KEY = (integration?.metadata as any)?.api_key
      ?? (integration?.access_token && integration.access_token !== "plugin-managed" ? integration.access_token : null)
      ?? env("FRAMER_API_TOKEN");
    const FRAMER_COLLECTION_ID = (integration?.metadata as any)?.collection_id
      ?? env("FRAMER_COLLECTION_ID");

    if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY) {
      return new Response(JSON.stringify({
        error: "Framer credentials not configured. Set FRAMER_PROJECT_URL and FRAMER_API_TOKEN secrets, or use the Framer plugin for syncing."
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!FRAMER_COLLECTION_ID) {
      throw new Error("Missing FRAMER_COLLECTION_ID");
    }

    // Diagnostics
    const url = new URL(req.url);
    if (req.method === "GET" || url.searchParams.get("debug") === "1") {
      const { connect } = await import("https://esm.sh/framer-api@0.1.2");
      const framer = await connect(FRAMER_PROJECT_URL, FRAMER_API_KEY);
      try {
        const collections = await framer.getCollections();
        const hit = collections.find((c: any) => c.id === FRAMER_COLLECTION_ID);

        return new Response(
          JSON.stringify(
            {
              ok: true,
              collections: collections.map((c: any) => ({ id: c.id, name: c.name, managedBy: c.managedBy })),
              resolvedCollection: hit ? { id: hit.id, name: hit.name } : null,
              note:
                "If resolvedCollection is null, update FRAMER_COLLECTION_ID to match one of the listed collection IDs.",
            },
            null,
            2
          ),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } finally {
        await framer.disconnect();
      }
    }

    const body = (await req.json()) as PublishBody;

    const articleId = body.article_id ?? body.id;
    if (!body?.title || !body?.slug) {
      throw new Error("title and slug are required");
    }

    const { connect } = await import("https://esm.sh/framer-api@0.1.2");
    const framer = await connect(FRAMER_PROJECT_URL, FRAMER_API_KEY);

    try {
      const collections = await framer.getCollections();
      const collection = collections.find((c: any) => c.id === FRAMER_COLLECTION_ID);
      if (!collection) {
        throw new Error(
          `FRAMER_COLLECTION_ID not found in project. Available: ${collections
            .map((c: any) => `${c.name} (${c.id})`)
            .join(", ")}`
        );
      }

      const fields = await collection.getFields();
      const byName = new Map<string, any>();
      for (const f of fields) byName.set(normalize(f.name), f);

      const pick = (names: string[]) => {
        for (const n of names) {
          const f = byName.get(normalize(n));
          if (f) return f;
        }
        return null;
      };

      const titleField = pick(["title", "name"]);
      const slugField = pick(["slug"]);
      const contentField = pick(["content", "body"]);
      const excerptField = pick(["excerpt", "summary"]);
      const categoryField = pick(["category"]);
      const coverField = pick(["cover image", "cover", "cover_image", "coverimage"]);
      const metaDescField = pick(["meta description", "meta_description", "metadescription", "description"]);

      const fieldData: Record<string, any> = {};

      if (titleField) fieldData[titleField.id] = { type: "string", value: body.title };
      if (slugField) fieldData[slugField.id] = { type: "string", value: body.slug };

      if (contentField) {
        fieldData[contentField.id] = {
          type: "formattedText",
          value: body.content ?? "",
          contentType: "html",
        };
      }

      if (excerptField) fieldData[excerptField.id] = { type: "string", value: body.excerpt ?? "" };
      if (categoryField) fieldData[categoryField.id] = { type: "string", value: body.category ?? "" };
      if (metaDescField) fieldData[metaDescField.id] = { type: "string", value: body.meta_description ?? "" };
      if (coverField && body.cover_image_url) {
        // Must be a URL (not base64)
        if (body.cover_image_url.startsWith("data:")) {
          console.warn("Cover image is a data URI; omitting cover image field for Framer.");
        } else {
          fieldData[coverField.id] = { type: "image", value: body.cover_image_url };
        }
      }

      // Upsert logic:
      // - If framer_item_id is known, update.
      // - Else find existing by slug and update.
      let itemId: string | null = body.framer_item_id ?? null;
      if (!itemId) {
        const items = await collection.getItems();
        const existing = items.find((it: any) => it.slug === body.slug);
        if (existing?.id) itemId = existing.id;
      }

      await collection.addItems([
        {
          ...(itemId ? { id: itemId } : {}),
          slug: body.slug,
          fieldData,
        },
      ]);

      // Confirm current id for caller
      const itemsAfter = await collection.getItems();
      const saved = itemsAfter.find((it: any) => it.slug === body.slug) ?? null;
      const finalFramerItemId = saved?.id ?? itemId ?? null;

      // Save framer_item_id back to articles table so delete can find it later
      if (articleId && finalFramerItemId) {
        try {
          const supabaseService = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          await supabaseService
            .from("articles")
            .update({ framer_item_id: finalFramerItemId })
            .eq("id", articleId);
        } catch (e) {
          console.warn("Failed to save framer_item_id back to DB:", e);
        }
      }

      return new Response(
        JSON.stringify(
          {
            ok: true,
            article_id: articleId ?? null,
            framer_item_id: finalFramerItemId,
            framer_slug: saved?.slug ?? body.slug,
          },
          null,
          2
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      await framer.disconnect();
    }
  } catch (error) {
    console.error("publish-to-framer error:", error);
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
