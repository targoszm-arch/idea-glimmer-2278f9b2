import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEYGEN_BASE = "https://api.heygen.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY");
    if (!HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY not configured");

    const { action, template_id, variables, title, video_id, prompt } = await req.json();

    const heygenHeaders = {
      "X-Api-Key": HEYGEN_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // ACTION: list_templates - Get all templates from HeyGen account
    if (action === "list_templates") {
      const resp = await fetch(`${HEYGEN_BASE}/v2/templates`, {
        headers: heygenHeaders,
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("HeyGen list templates error:", resp.status, t);
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }

      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: get_template - Get a specific template's details (variables, etc.)
    if (action === "get_template") {
      if (!template_id) throw new Error("template_id is required");

      const resp = await fetch(`${HEYGEN_BASE}/v2/template/${template_id}`, {
        headers: heygenHeaders,
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("HeyGen get template error:", resp.status, t);
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }

      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: generate - Generate a video from a template
    if (action === "generate") {
      if (!template_id) throw new Error("template_id is required");

      const body: Record<string, unknown> = {
        test: false,
        caption: false,
      };

      if (title) body.title = title;
      if (variables && Object.keys(variables).length > 0) {
        body.variables = variables;
      }

      const resp = await fetch(`${HEYGEN_BASE}/v2/template/${template_id}/generate`, {
        method: "POST",
        headers: heygenHeaders,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("HeyGen generate error:", resp.status, t);
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }

      const data = await resp.json();
      console.log("HeyGen video generation started:", JSON.stringify(data));

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: status - Check video generation status
    if (action === "status") {
      if (!video_id) throw new Error("video_id is required");

      const resp = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${video_id}`, {
        headers: heygenHeaders,
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("HeyGen status error:", resp.status, t);
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }

      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("heygen error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
