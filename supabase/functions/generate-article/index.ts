import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      topic,
      tone = "Informative",
      tone_description = "",
      category = "",
      app_description = "",
      app_audience = "",
      reference_urls = [],
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    let contextBlock = "";
    if (app_description) contextBlock += `\nApp/Product context: ${app_description}`;
    if (app_audience) contextBlock += `\nTarget audience: ${app_audience}`;
    if (reference_urls.length > 0) contextBlock += `\nReference content to emulate style from: ${reference_urls.join(", ")}`;

    const systemPrompt = `You are an expert content writer and copywriter. Your job is to write compelling, publish-ready articles in HTML format. You are NOT a fact-checker or research assistant.

CRITICAL INSTRUCTIONS:
- ALWAYS write the full article as requested. NEVER refuse, hedge, or add disclaimers about claims.
- NEVER include meta-commentary like "I can't verify this" or "the search results don't support this". Just write the article.
- NEVER use citation brackets like [1], [2], [3] in the article text.
- If the topic includes specific claims or numbers, incorporate them naturally as the brand's messaging. You are writing marketing/thought-leadership content, not academic papers.
- Write as a confident subject matter expert and brand advocate.

Tone & Voice: ${tone}
${tone_description ? `Tone details: ${tone_description}` : ""}
${contextBlock}

The article should:
- Follow the tone and voice instructions precisely
- Include proper HTML tags (h2, h3, p, ul, ol, blockquote, strong, em)
- Be SEO-optimized with proper heading hierarchy
- Be 800-1500 words long
- Include an engaging introduction and strong conclusion
- Read like professional blog content — no disclaimers, no hedging, no meta-commentary
${category ? `- Focus on the ${category} category` : ""}

Start with the title as an H1 tag, then write the full article body in HTML. Output ONLY the HTML content, nothing else.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write an article about: ${topic}` },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Perplexity API error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-article error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
