import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { connect } from "npm:framer-api@0.1.2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FRAMER_PROJECT_URL = env("FRAMER_PROJECT_URL");
    const FRAMER_API_KEY = env("FRAMER_API_KEY") ?? env("FRAMER_API_TOKEN");
    const FRAMER_COLLECTION_ID = env("FRAMER_COLLECTION_ID");

    if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY) {
      throw new Error("Missing FRAMER_PROJECT_URL and/or FRAMER_API_KEY (or FRAMER_API_TOKEN)");
    }
    if (!FRAMER_COLLECTION_ID) {
      throw new Error("Missing FRAMER_COLLECTION_ID");
    }

    // Diagnostics
    const url = new URL(req.url);
    if (req.method === "GET" || url.searchParams.get("debug") === "1") {
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

      return new Response(
        JSON.stringify(
          {
            ok: true,
            article_id: articleId ?? null,
            framer_item_id: saved?.id ?? itemId ?? null,
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
