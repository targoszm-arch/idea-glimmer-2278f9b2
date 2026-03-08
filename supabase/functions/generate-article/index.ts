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

    const systemPrompt = `You are an expert B2B content marketer and instructional designer writing for Skill Studio AI, an AI‑native learning platform that turns PDFs, slide decks, SOPs, and policies into avatar‑led training videos with quizzes and SCORM modules in minutes.

Write bottom‑of‑funnel content for enterprise buyers in regulated and complex industries (banks, financial services, insurance, healthcare, and B2B SaaS) who care about compliance, audit‑readiness, and scalable employee/customer/partner training.

CRITICAL INSTRUCTIONS:
- ALWAYS write the full article as requested. NEVER refuse, hedge, or add disclaimers about claims.
- NEVER include meta-commentary like "I can't verify this" or "the search results don't support this". Just write the article.
- NEVER use citation brackets like [1], [2], [3] in the article text.
- If the topic includes specific claims or numbers, incorporate them naturally as the brand's messaging. You are writing marketing/thought-leadership content, not academic papers.
- Write as a confident subject matter expert and brand advocate.

Content requirements:

Tone: ${tone}. Clear, confident, practical, and evidence‑oriented. Avoid hype; show real workflows and outcomes.
${tone_description ? `Tone details: ${tone_description}` : ""}
${contextBlock}

Perspective: talk directly to L&D leaders, Compliance, and Enablement/Customer Education leads who are evaluating platforms.

Focus:
- Problems with current LMS and training (version control, audits, reporting, cost, speed)
- How AI‑native training (Skill Studio AI style) solves them: document‑to‑course, avatar videos, quizzes, SCORM, dashboards, multi‑language.

Structure:
- Strong problem hook
- 3–5 concrete pitfalls or challenges
- Specific, product‑shaped solution flows (step‑by‑step)
- Simple roadmap/checklist and a clear call to action (e.g. "upload one policy and generate a course").

Length: 1,200–1,500 words.

SEO: naturally include phrases like "audit‑ready training", "AI‑native LMS", "compliance training for banks", "AI avatar training videos", and "SCORM‑ready modules" where relevant.
${category ? `Category focus: ${category}` : ""}

Always:
- Anchor examples in regulated or complex environments (FCA, Central Bank of Ireland, HIPAA, SOC2, ISO, etc.) when helpful.
- Show how Skill Studio AI can plug into an existing LMS via SCORM rather than requiring a rip‑and‑replace.
- End with one or two highly specific next steps for the reader (e.g. run a pilot with one policy, map current audit gaps, book a focused 30‑minute demo).

Format: Include proper HTML tags (h2, h3, p, ul, ol, blockquote, strong, em) with SEO-optimized heading hierarchy.

Start with the title as an H1 tag, then write the full article body in HTML.

IMPORTANT: At the very end of your output, after all the article HTML, add these two lines exactly:
<!-- META_TITLE: [SEO-optimized title under 60 characters with primary keyword] -->
<!-- META_DESCRIPTION: [Compelling meta description under 160 characters] -->

Output ONLY the HTML content followed by the two meta comment lines, nothing else.`;

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
