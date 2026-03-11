import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      throw new Error(
        "Missing FRAMER_API_TOKEN / FRAMER_SITE_ID / FRAMER_COLLECTION_ID secret(s)"
      );
    }

    const headers = {
      Authorization: `Bearer ${FRAMER_API_TOKEN}`,
    };

    const probe = async (name: string, url: string) => {
      const res = await fetch(url, { headers });
      const text = await res.text();
      return {
        name,
        url,
        status: res.status,
        bodySnippet: text?.slice(0, 300) || "",
      };
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
  } catch (error) {
    console.error("framer-probe error:", error);
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
