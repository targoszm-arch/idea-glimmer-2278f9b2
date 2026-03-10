import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const platformDescriptions: Record<string, string> = {
  linkedin: "LinkedIn posts — professional, thought-leadership oriented, with hooks, insights, and CTAs. Posts should be 800-1300 characters.",
  youtube: "YouTube videos — SEO-optimized titles, compelling descriptions, script outlines with hooks and talking points.",
  twitter: "Twitter/X threads — punchy, data-driven, scroll-stopping threads of 5-8 tweets.",
  instagram_carousel: "Instagram carousel posts — visual slide-by-slide content (7-10 slides) with headlines, body text, and image concepts.",
  instagram_reel: "Instagram Reels — short-form video scripts (30-60 seconds) with hooks, scenes, captions, and audio suggestions.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      platform = "linkedin",
      niche = "",
      app_description = "",
      app_audience = "",
      tone = "",
      tone_description = "",
      reference_urls = [],
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    const platformDesc = platformDescriptions[platform] || platformDescriptions.linkedin;

    let contextParts: string[] = [];
    if (app_description) contextParts.push(`Product/App: ${app_description}`);
    if (app_audience) contextParts.push(`Target audience: ${app_audience}`);
    if (tone) contextParts.push(`Preferred tone: ${tone}`);
    if (tone_description) contextParts.push(`Tone details: ${tone_description}`);
    if (reference_urls.length > 0) contextParts.push(`IMPORTANT — Reference posts/content the user likes (study these for tone, structure, hooks, and style): ${reference_urls.join(", ")}. Analyse these links and generate ideas that match their style, format, and engagement patterns.`);
    if (niche) contextParts.push(`Additional context/niche: ${niche}`);

    const contextBlock = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join("\n")}` : "";

    const userPrompt = niche
      ? `Generate social media post ideas for: ${niche}`
      : app_description
        ? `Generate social media post ideas for this product/app: ${app_description}`
        : "Generate social media post ideas";

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `You are an expert B2B social media content strategist. Generate 6 highly specific, actionable content ideas for ${platformDesc}

CRITICAL RULES:
- Each idea needs a compelling, specific title/headline — NOT generic. Include the target persona, specific outcome, or a concrete angle.
- Each description must be 2-3 sentences explaining: (1) what specific angle the post takes, (2) what value the audience gets, (3) the key message or hook.
- Ideas should cover a mix of educational, thought-leadership, practical how-to, and product-positioning content.
- Every idea must feel like it could be a standalone, high-performing ${platform} post that a professional would engage with.
- Avoid vague, buzzword-heavy titles. Be concrete and specific to the product domain and audience.

Return ideas as a JSON object only, no markdown, no code fences. Format:
{"ideas":[{"title":"...","description":"2-3 sentence brief explaining the angle, value, and key hook","topic":"..."}]}${contextBlock}`
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Perplexity API error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch { /* fall through */ }
      }
      console.error("Failed to parse social ideas from Perplexity:", content);
      return new Response(JSON.stringify({ ideas: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("generate-social-ideas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
