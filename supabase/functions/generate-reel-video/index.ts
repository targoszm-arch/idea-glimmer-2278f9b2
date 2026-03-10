import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const _ah = req.headers.get("Authorization");
    if (!_ah?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const _ac = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: _ah } },
    });
    const { error: _ae } = await _ac.auth.getClaims(_ah.replace("Bearer ", ""));
    if (_ae) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const { action, video_id, prompt, topic, tone, tone_description, app_description, app_audience, reference_urls } = await req.json();

    // ACTION: start - generate prompt and kick off Sora video generation
    if (action === "start") {
      // First, use AI to generate a compelling video prompt from the topic
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
      let videoPrompt = prompt;
      
      if (!videoPrompt && topic) {
        // Generate a visual prompt from the topic using AI
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a top-tier creative director specializing in viral Instagram Reels. Generate a vivid, scene-by-scene video prompt for the Sora AI video generator that matches the style of trending Instagram Reels.

The video MUST follow these Instagram Reel best practices:
- **Hook in first 1-2 seconds**: Eye-catching visual — bold motion, dramatic zoom, or unexpected reveal
- **Vertical 9:16 format**: Portrait-oriented, optimized for mobile
- **Text overlay style**: Bold, large sans-serif text appearing on screen with punchy headlines, stats, or key phrases — like creator text stickers in Reels
- **Dynamic transitions**: Whip pans, zoom cuts, morph transitions, or slide-ins between scenes
- **Trending Reel formats**: "3 things you didn't know about...", "Watch this transformation", "POV:", talking-head with B-roll cutaways, before/after reveals, listicle with numbered points on screen
- **Pacing**: Fast-paced, scene changes every 2-3 seconds
- **Visual style**: Clean, high-contrast, well-lit, modern color grading (warm tones, cinematic, or vibrant saturated)
- **Motion graphics**: Animated progress bars, arrows, highlights, underlines, or icons alongside content
- **Energy**: Reference the energy level (upbeat, dramatic, calm) to guide pacing
- **CTA ending**: End with a clear visual call-to-action — "Follow for more", "Save this", or brand-specific

Rules:
- Output ONLY the video prompt text, nothing else
- Keep it under 250 words
- Be extremely specific about camera movements, lighting, colors, text on screen, and transitions
- Describe each scene/shot sequentially (Scene 1, Scene 2, etc.)
- Include exactly what text appears on screen and how it animates
${app_description ? `\nBrand context: ${app_description}` : ""}
${app_audience ? `\nTarget audience: ${app_audience}` : ""}
${tone ? `\nTone: ${tone}` : ""}
${tone_description ? `\nTone details: ${tone_description}` : ""}
${reference_urls?.length ? `\nReference content style from: ${reference_urls.join(", ")}` : ""}`,
              },
              { role: "user", content: `Create a Sora video prompt for this Instagram Reel topic: "${topic}"` },
            ],
          }),
        });

        if (!aiResp.ok) {
          const t = await aiResp.text();
          throw new Error(`Failed to generate video prompt: ${t}`);
        }

        const aiData = await aiResp.json();
        videoPrompt = aiData.choices?.[0]?.message?.content?.trim() || topic;
      }

      // Start Sora video generation
      const soraResp = await fetch("https://api.openai.com/v1/videos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sora-2",
          prompt: videoPrompt,
          size: "720x1280",
        }),
      });

      if (!soraResp.ok) {
        const errText = await soraResp.text();
        console.error("Sora API error:", soraResp.status, errText);
        throw new Error(`Sora API error (${soraResp.status}): ${errText}`);
      }

      const soraData = await soraResp.json();
      console.log("Sora job created:", JSON.stringify(soraData));

      return new Response(
        JSON.stringify({
          video_id: soraData.id,
          status: soraData.status,
          video_prompt: videoPrompt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: status - poll for video generation status
    if (action === "status") {
      if (!video_id) throw new Error("video_id is required for status check");

      const statusResp = await fetch(`https://api.openai.com/v1/videos/${video_id}`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });

      if (!statusResp.ok) {
        const errText = await statusResp.text();
        throw new Error(`Status check failed (${statusResp.status}): ${errText}`);
      }

      const statusData = await statusResp.json();
      console.log("Video status:", JSON.stringify(statusData));

      return new Response(JSON.stringify(statusData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: download - download the completed video and upload to Supabase storage
    if (action === "download") {
      if (!video_id) throw new Error("video_id is required for download");

      // Download from OpenAI
      const dlResp = await fetch(`https://api.openai.com/v1/videos/${video_id}/content`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });

      if (!dlResp.ok) {
        const errText = await dlResp.text();
        throw new Error(`Download failed (${dlResp.status}): ${errText}`);
      }

      const videoBlob = await dlResp.arrayBuffer();

      // Upload to Supabase storage
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const fileName = `reel_${video_id}_${Date.now()}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from("reel-videos")
        .upload(fileName, videoBlob, {
          contentType: "video/mp4",
          upsert: false,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("reel-videos")
        .getPublicUrl(fileName);

      return new Response(
        JSON.stringify({ video_url: urlData.publicUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("generate-reel-video error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
