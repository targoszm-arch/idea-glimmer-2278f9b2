import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Since we cannot use the official framer-api library easily here, we will just use the REST API.
// Note: Framer Server API currently uses a WebSocket channel internally or specific auth.
// But they have released a `framer-api` NPM package that does this.
// For now, let's just make the REST request like we did, but the 404 means the endpoint is wrong.


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Lightweight diagnostics to confirm Framer IDs/token and endpoint availability.
  // Call: GET /functions/v1/publish-to-framer?debug=1
  const url = new URL(req.url);
  if (req.method === "GET" || url.searchParams.get("debug") === "1") {
    try {
      const FRAMER_API_TOKEN = Deno.env.get("FRAMER_API_TOKEN");
      const FRAMER_SITE_ID = Deno.env.get("FRAMER_SITE_ID");
      const FRAMER_COLLECTION_ID = Deno.env.get("FRAMER_COLLECTION_ID");

      if (!FRAMER_API_TOKEN || !FRAMER_SITE_ID || !FRAMER_COLLECTION_ID) {
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              "Missing FRAMER_API_TOKEN / FRAMER_SITE_ID / FRAMER_COLLECTION_ID secret(s)",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      const headers = { Authorization: `Bearer ${FRAMER_API_TOKEN}` };

      const probe = async (name: string, targetUrl: string) => {
        try {
          const res = await fetch(targetUrl, { headers });
          const text = await res.text();
          return {
            name,
            url: targetUrl,
            status: res.status,
            bodySnippet: text?.slice(0, 300) || "",
          };
        } catch (e) {
          return {
            name,
            url: targetUrl,
            status: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      };

      const base = `https://api.framer.com/v1/sites/${FRAMER_SITE_ID}`;
      const results = await Promise.all([
        probe("site", base),
        probe("collections", `${base}/collections`),
        probe("collection", `${base}/collections/${FRAMER_COLLECTION_ID}`),
        probe("items", `${base}/collections/${FRAMER_COLLECTION_ID}/items`),
      ]);

      return new Response(
        JSON.stringify(
          {
            ok: true,
            note:
              "If all endpoints are 404, Framer likely doesn't expose this REST API for your account/project (or the SITE/COLLECTION IDs are not the right type).",
            results,
          },
          null,
          2
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
  }

  try {
    const FRAMER_API_TOKEN = Deno.env.get("FRAMER_API_TOKEN");
    const FRAMER_SITE_ID = Deno.env.get("FRAMER_SITE_ID");
    const FRAMER_COLLECTION_ID = Deno.env.get("FRAMER_COLLECTION_ID");
    
    if (!FRAMER_API_TOKEN || !FRAMER_SITE_ID || !FRAMER_COLLECTION_ID) {
      throw new Error("FRAMER_API_TOKEN, FRAMER_SITE_ID, and FRAMER_COLLECTION_ID must be configured");
    }


    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    // POST { action: "debug" } to get endpoint probes without attempting a publish.
    if (payload?.action === "debug") {
      const headers = { Authorization: `Bearer ${FRAMER_API_TOKEN}` };

      const probe = async (name: string, targetUrl: string) => {
        try {
          const res = await fetch(targetUrl, { headers });
          const text = await res.text();
          return {
            name,
            url: targetUrl,
            status: res.status,
            bodySnippet: text?.slice(0, 300) || "",
          };
        } catch (e) {
          return {
            name,
            url: targetUrl,
            status: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      };

      const base = `https://api.framer.com/v1/sites/${FRAMER_SITE_ID}`;
      const results = await Promise.all([
        probe("site", base),
        probe("collections", `${base}/collections`),
        probe("collection", `${base}/collections/${FRAMER_COLLECTION_ID}`),
        probe("items", `${base}/collections/${FRAMER_COLLECTION_ID}/items`),
      ]);

      return new Response(JSON.stringify({ ok: true, results }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      title,
      slug,
      content,
      excerpt,
      meta_description,
      category,
      cover_image_url,
      created_at,
      updated_at,
    } = payload;

    if (!title || !slug) {
      throw new Error("title and slug are required");
    }

    // Validate that cover_image_url is a valid URL, not a base64 string
    let validCoverImageUrl = cover_image_url;
    if (cover_image_url && cover_image_url.startsWith("data:")) {
      console.warn("Cover image is a base64 data URI, which Framer API does not accept. Omitting cover_image field.");
      validCoverImageUrl = null;
    }

    // Framer CMS API endpoint using collection ID
    const framerApiUrl = `https://api.framer.com/v1/sites/${FRAMER_SITE_ID}/collections/${FRAMER_COLLECTION_ID}/items`;

    const framerPayload = {
      slug,
      fieldData: {
        title,
        content,
        excerpt: excerpt || meta_description,
        meta_description,
        category,
        cover_image: validCoverImageUrl,
      },
    };

    console.log("Publishing to Framer CMS:", JSON.stringify(framerPayload, null, 2));

    const response = await fetch(framerApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FRAMER_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(framerPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Framer API error:", response.status, errorText);
      throw new Error(
        `Framer API error (${response.status}) for ${framerApiUrl}: ${errorText || "<empty body>"}`
      );
    }

    const data = await response.json();
    console.log("Successfully published to Framer:", JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
