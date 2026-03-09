import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FRAMER_API_TOKEN = Deno.env.get("FRAMER_API_TOKEN");
    const FRAMER_SITE_ID = Deno.env.get("FRAMER_SITE_ID");
    const FRAMER_COLLECTION_ID = Deno.env.get("FRAMER_COLLECTION_ID");
    
    if (!FRAMER_API_TOKEN || !FRAMER_SITE_ID || !FRAMER_COLLECTION_ID) {
      throw new Error("FRAMER_API_TOKEN, FRAMER_SITE_ID, and FRAMER_COLLECTION_ID must be configured");
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
    } = await req.json();

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
      fieldData: {
        slug,
        title,
        content,
        excerpt: excerpt || meta_description,
        meta_description,
        category,
        cover_image: cover_image_url,
        created_at,
        updated_at,
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
      throw new Error(`Framer API error (${response.status}): ${errorText}`);
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
