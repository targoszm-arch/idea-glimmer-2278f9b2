import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEYGEN_BASE = "https://api.heygen.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !data?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = data.claims.sub;

    // Only deduct credits for generate action (not list/status/download)
    const bodyText = await req.text();
    const bodyJson = JSON.parse(bodyText);
    if (bodyJson.action === 'generate') {
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: hasCredits } = await supabaseAdmin.rpc('deduct_credits', { p_user_id: userId, p_amount: 20, p_action: 'heygen_video' });
      if (!hasCredits) {
        return new Response(JSON.stringify({ error: 'Insufficient credits', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }


    const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY");
    if (!HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY not configured");

    const { action, template_id, variables, title, video_id, prompt } = bodyJson;

    const heygenHeaders = {
      "X-Api-Key": HEYGEN_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // ACTION: list_templates
    if (action === "list_templates") {
      const resp = await fetch(`${HEYGEN_BASE}/v2/templates`, { headers: heygenHeaders });
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

    // ACTION: get_template
    if (action === "get_template") {
      if (!template_id) throw new Error("template_id is required");
      const resp = await fetch(`${HEYGEN_BASE}/v2/template/${template_id}`, { headers: heygenHeaders });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: generate
    if (action === "generate") {
      if (!template_id) throw new Error("template_id is required");
      const body: Record<string, unknown> = { test: false, caption: false };
      if (title) body.title = title;
      if (variables && Object.keys(variables).length > 0) body.variables = variables;

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

    // ACTION: status
    if (action === "status") {
      if (!video_id) throw new Error("video_id is required");
      const resp = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${video_id}`, {
        headers: heygenHeaders,
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HeyGen API error (${resp.status}): ${t}`);
      }
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: download - Download video from HeyGen URL and store in Supabase storage
    if (action === "download") {
      if (!video_id) throw new Error("video_id is required");

      // 1. Get the video status to find the video_url
      const statusResp = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${video_id}`, {
        headers: heygenHeaders,
      });
      if (!statusResp.ok) {
        const t = await statusResp.text();
        throw new Error(`HeyGen status error (${statusResp.status}): ${t}`);
      }
      const statusData = await statusResp.json();
      const heygenUrl = statusData?.data?.video_url;
      if (!heygenUrl) throw new Error("No video_url found - video may not be ready yet");

      console.log("Downloading HeyGen video from:", heygenUrl);

      // 2. Download the video binary
      const videoResp = await fetch(heygenUrl);
      if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
      const videoBlob = await videoResp.arrayBuffer();

      // 3. Upload to Supabase storage
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const fileName = `heygen-${video_id}-${Date.now()}.mp4`;
      const filePath = `heygen/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("reel-videos")
        .upload(filePath, videoBlob, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(`Failed to upload video: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from("reel-videos")
        .getPublicUrl(filePath);

      console.log("Video stored at:", publicUrlData.publicUrl);

      return new Response(JSON.stringify({
        video_url: publicUrlData.publicUrl,
        heygen_url: heygenUrl,
        file_path: filePath,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: agent
    if (action === "agent") {
      if (!prompt) throw new Error("prompt is required for agent action");
      
      // Get brand logo from Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: brandAssets } = await supabase
        .from("brand_assets")
        .select("*")
        .eq("type", "visual")
        .order("created_at", { ascending: false })
        .limit(1);
      
      const brandLogoUrl = brandAssets && brandAssets.length > 0 ? brandAssets[0].file_url : undefined;
      
      const body: Record<string, unknown> = { prompt };
      if (brandLogoUrl) {
        body.brand_logo = brandLogoUrl;
        console.log("Including brand logo in HeyGen agent request:", brandLogoUrl);
      }
      
      const resp = await fetch(`${HEYGEN_BASE}/v1/video_agent/generate`, {
        method: "POST",
        headers: heygenHeaders,
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HeyGen Agent API error (${resp.status}): ${t}`);
      }
      const data = await resp.json();
      console.log("HeyGen agent video started:", JSON.stringify(data));
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
