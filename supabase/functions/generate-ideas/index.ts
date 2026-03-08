import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
            content: `You are a content strategist. Generate 8 content ideas using the TOFU/MOFU/BOFU funnel strategy.
Use the provided context about the product, audience, and tone to make ideas highly relevant and specific.
Return ideas as a JSON object only, no markdown, no code fences. Format:
{"ideas":[{"title":"...","strategy":"TOFU|MOFU|BOFU","category":"...","topic":"..."}]}${contextBlock}`
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
