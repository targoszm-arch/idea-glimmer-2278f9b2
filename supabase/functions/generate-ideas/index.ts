import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    
    const {
      niche = "",
      app_description = "",
      app_audience = "",
      tone = "",
      tone_description = "",
      reference_urls = [],
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    // Build context from AI settings + optional niche override
    let contextParts: string[] = [];
    if (app_description) contextParts.push(`Product/App: ${app_description}`);
    if (app_audience) contextParts.push(`Target audience: ${app_audience}`);
    if (tone) contextParts.push(`Preferred tone: ${tone}`);
    if (tone_description) contextParts.push(`Tone details: ${tone_description}`);
    if (reference_urls.length > 0) contextParts.push(`Reference content style from: ${reference_urls.join(", ")}`);
    if (niche) contextParts.push(`Additional context/niche: ${niche}`);

    const contextBlock = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join("\n")}` : "";

    const userPrompt = niche
      ? `Generate content ideas for: ${niche}`
      : app_description
        ? `Generate content ideas for this product/app: ${app_description}`
        : "Generate content ideas";

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
            content: `You are an expert content strategist for B2B SaaS and enterprise audiences. Generate 8 highly specific, actionable content ideas using the TOFU/MOFU/BOFU funnel strategy.

CRITICAL RULES FOR QUALITY:
- Titles must be specific and compelling — NOT generic. Include the target persona, the specific outcome, or a concrete angle. Bad: "Benefits of AI in Training". Good: "Beyond Completion Rates: Essential L&D Metrics for HR Teams".
- Descriptions must be 2-3 sentences that clearly articulate: (1) what specific angle the article takes, (2) what actionable value the reader gets, and (3) who specifically benefits. Think of the description as a brief for a writer — it should make the article's direction crystal clear.
- TOFU ideas should be educational and thought-leadership oriented, helping readers discover concepts. Prefer "What is X and How it Does Y?" or "The Benefits of X for Y" formats.
- MOFU ideas should be practical how-to guides, step-by-step processes, or comparison content. Use formats like "How to X for Y: A Step-by-Step Guide" or "X vs Y: What Z Teams Need to Know".
- BOFU ideas should drive decisions — case studies, feature comparisons, ROI arguments, or transformation stories. Use formats like "Why X Teams Switch to Y for Z" or "Choosing the Right X: Essential Features for Y Success".
- Each idea must feel like it could be a standalone, publishable article that a professional would want to read.
- Avoid vague, buzzword-heavy titles. Be concrete and specific to the product domain and audience.

Use the provided context about the product, audience, and tone to make ideas highly relevant and specific.
Return ideas as a JSON object only, no markdown, no code fences. Format:
{"ideas":[{"title":"...","description":"2-3 sentence brief explaining the specific angle, actionable value, and target reader","strategy":"TOFU|MOFU|BOFU","category":"...","topic":"..."}]}${contextBlock}`
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      console.error("Failed to parse ideas from Perplexity:", content);
      return new Response(JSON.stringify({ ideas: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("generate-ideas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
