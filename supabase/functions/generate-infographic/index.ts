// Infographic generator.
//
// Text rendering inside an image is historically where DALL-E falls over — you
// get garbled labels, nonsense numbers, and chart legends that look like they
// were run through a photocopier. Gemini 2.5 Flash Image ("nano banana")
// renders text inside images dramatically better, so this edge function
// prioritizes it and falls back to OpenAI only if it's not configured or errors.
//
// Provider chain:
//   1. Gemini 2.5 Flash Image (GEMINI_API_KEY) — primary. Vertical aspectRatio.
//   2. OpenAI DALL-E 3 (OPENAI_API_KEY) — last-resort fallback.
//
// Output stays the same: base64 PNG uploaded to the `article-covers` bucket
// under `infographics/`, public URL returned as `image_url`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: hasCredits } = await supabaseAdmin.rpc('deduct_credits', { p_user_id: user.id, p_amount: 5, p_action: 'generate_infographic' });
    if (!hasCredits) {
      return new Response(JSON.stringify({ error: 'Insufficient credits', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { prompt, style = "general" } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      throw new Error("No image generation provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const stylePrompts: Record<string, string> = {
      comparison: "A clean, modern infographic comparing two or more items side by side. Use columns, icons, and clear labels. Flat design with a professional color palette.",
      stats: "A data-driven infographic with bold statistics, charts, and metric cards. Clean flat design, professional color palette, large numbers with supporting labels.",
      timeline: "A vertical timeline infographic showing a progression of steps or events. Clean design with numbered markers, connecting lines, and concise labels.",
      process: "A horizontal process flow infographic with numbered steps connected by arrows. Clean, minimal design with icons for each step.",
      general: "A professional, clean infographic with structured data visualization. Flat design, modern color palette, clear hierarchy.",
    };

    const styleGuide = stylePrompts[style] || stylePrompts.general;

    // Full prompt. Gemini renders text well, so we can ask it to reproduce
    // the user's prompt verbatim. The "render text crisply" line is the
    // specific nudge that separates readable output from the garbled-labels
    // failure mode we saw with DALL-E.
    const fullPrompt = `Create a professional, production-ready infographic poster. ${styleGuide}

Topic and content: ${prompt}

Typography requirements:
- All text must be crisply rendered and spelled correctly. Every label, heading, number, and caption must be legible and accurate — NO garbled letters, invented words, or pseudo-text.
- Use a single sans-serif typeface family throughout.
- Clear visual hierarchy: large bold heading at the top, medium-weight section headers, small body copy for details.

Visual requirements:
- Clean light background (white or very pale).
- Professional color palette — 3-4 colors max, no neon or gradient noise.
- Flat design. No watermarks. No logos. No stock-photo faces.
- Vertical poster layout, optimized for mobile viewing.`;

    let b64: string | null = null;
    let providerUsed: "gemini" | "dall-e-3" | null = null;
    let lastError: string | null = null;

    // Provider 1 — Gemini 2.5 Flash Image ("nano banana"). Primary, because
    // DALL-E produces unusable text on infographics.
    if (GEMINI_API_KEY) {
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                // Vertical poster. 3:4 is the closest Gemini aspect to the
                // 1024x1792 we used to request from DALL-E. Infographics read
                // best in portrait for article embedding + mobile.
                imageConfig: { aspectRatio: "3:4" },
              },
            }),
          },
        );
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          const parts = gemData?.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
          const inline = imgPart?.inlineData || imgPart?.inline_data;
          if (inline?.data) {
            b64 = inline.data;
            providerUsed = "gemini";
          } else {
            lastError = "Gemini returned no image part";
            console.warn("Gemini no-image response:", JSON.stringify(gemData).slice(0, 500));
          }
        } else {
          lastError = `Gemini HTTP ${gemRes.status}: ${(await gemRes.text()).slice(0, 300)}`;
          console.warn(lastError);
        }
      } catch (e: any) {
        lastError = `Gemini threw: ${e?.message ?? e}`;
        console.warn(lastError);
      }
    }

    // Provider 2 — DALL-E 3 fallback. Only hit this if Gemini is unavailable
    // or errored. Known to produce garbled text; the previous behavior.
    if (!b64 && OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: `Create an infographic image. ${styleGuide} Topic: ${prompt}. Requirements: No watermarks, no logos. Clean white or light background. Professional typography. The infographic should be visually structured and easy to read.`,
          n: 1,
          size: "1024x1792",
          quality: "standard",
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("OpenAI DALL-E error:", response.status, t);
        return new Response(JSON.stringify({ error: `Infographic generation failed. Gemini: ${lastError ?? "n/a"}. DALL-E: ${t.slice(0, 200)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      b64 = data.data?.[0]?.b64_json ?? null;
      providerUsed = "dall-e-3";
    }

    if (!b64) {
      return new Response(JSON.stringify({ error: `No image generated. ${lastError ?? ""}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-infographic] provider=${providerUsed}`);

    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `infographic-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const filePath = `infographics/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("article-covers")
      .upload(filePath, bytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to upload infographic: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("article-covers")
      .getPublicUrl(filePath);

    return new Response(JSON.stringify({ image_url: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-infographic error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
