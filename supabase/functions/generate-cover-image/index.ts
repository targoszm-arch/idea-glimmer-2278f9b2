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
    const token = authHeader.replace('Bearer ', '').trim();
    const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let userId: string;
    let bodyJson: any;

    if (isServiceRole) {
      bodyJson = await req.json();
      const overrideId = bodyJson.user_id_override;
      if (!overrideId) {
        return new Response(JSON.stringify({ error: 'user_id_override required when using service role' }), { status: 400, headers: corsHeaders });
      }
      userId = overrideId;
    } else {
      const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      userId = user.id;
      bodyJson = await req.json();
    }

    const { data: hasCredits } = await supabaseAdmin.rpc('deduct_credits', { p_user_id: userId, p_amount: 5, p_action: 'generate_cover_image' });
    if (!hasCredits) {
      return new Response(JSON.stringify({ error: 'Insufficient credits', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { prompt, context } = bodyJson;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    // "Nano Banana" = Google's gemini-2.5-flash-image. Much better quality
    // for editorial cover photos than DALL-E 3 standard; when GEMINI_API_KEY
    // is configured we prefer it and only fall back to OpenAI on error.
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!OPENAI_API_KEY && !GEMINI_API_KEY) throw new Error("No image provider configured. Set GEMINI_API_KEY (preferred) or OPENAI_API_KEY.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Refine the topic into a concrete, text-free visual scene.
    // This uses OpenAI when available (cheap, reliable) and falls back to
    // passing the raw prompt through otherwise — Gemini's image model tends
    // to handle looser prompts well on its own.
    const topicInput = context
      ? `${prompt}. Context: ${context.substring(0, 300)}`
      : prompt;

    let scenePrompt = prompt; // fallback
    if (OPENAI_API_KEY) {
      const sceneRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You convert article topics into short image prompts (max 40 words).

Rules:
- Describe ONLY physical objects, environments, lighting, and camera angles.
- NEVER include abstract concepts, software terms, brand names, UI elements, screens, dashboards, charts, graphs, or icons.
- NEVER mention any text, words, letters, labels, signs, or typography.
- Think: "What real-world photograph would a magazine use as a cover for this article?"
- Focus on people, workspaces, nature, objects, or architectural scenes.
- Output ONLY the scene description, nothing else.`
            },
            { role: "user", content: topicInput }
          ],
          max_tokens: 80,
          temperature: 0.7,
        }),
      });

      if (sceneRes.ok) {
        const sceneData = await sceneRes.json();
        const generated = sceneData.choices?.[0]?.message?.content?.trim();
        if (generated) scenePrompt = generated;
      }
    }

    const fullPrompt = `Professional editorial photograph. ${scenePrompt}. Shot on DSLR, natural lighting, shallow depth of field. Photorealistic, not illustrated. Contains absolutely no text, letters, words, numbers, labels, watermarks, or any written characters.`;

    // Step 2: Generate the image. Try Gemini first (better output quality),
    // fall back to DALL-E 3 if Gemini is unavailable or errors.
    let b64: string | null = null;
    let providerUsed: "gemini" | "dall-e-3" | null = null;
    let lastError: string | null = null;

    if (GEMINI_API_KEY) {
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { responseModalities: ["IMAGE"] },
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

    if (!b64 && OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: fullPrompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          style: "natural",
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402 || response.status === 401) {
          return new Response(JSON.stringify({ error: "OpenAI API key issue — check billing or key validity." }), {
            status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("OpenAI DALL-E error:", response.status, t);
        return new Response(JSON.stringify({ error: `Image generation failed. Gemini error: ${lastError ?? "n/a"}. OpenAI error: ${t.slice(0, 200)}` }), {
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

    console.log(`[generate-cover-image] provider=${providerUsed}`);

    // Convert base64 to binary
    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const fileName = `cover-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const filePath = `covers/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("article-covers")
      .upload(filePath, bytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("article-covers")
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;

    return new Response(JSON.stringify({ image_url: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cover-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
