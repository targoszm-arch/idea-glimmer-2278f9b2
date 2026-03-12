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
      topic,
      tone = "Informative",
      tone_description = "",
      category = "",
      app_description = "",
      app_audience = "",
      reference_urls = [],
      brand_assets = { logos: [], visuals: [] },
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    let contextBlock = "";
    if (app_description) contextBlock += `\nApp/Product context: ${app_description}`;
    if (app_audience) contextBlock += `\nTarget audience: ${app_audience}`;
    if (reference_urls.length > 0) contextBlock += `\nReference content to emulate style from: ${reference_urls.join(", ")}`;
    if (brand_assets.logos?.length > 0) contextBlock += `\n\nBRAND IDENTITY — The brand has logos: ${brand_assets.logos.map((l: any) => l.name).join(", ")}. Incorporate brand identity awareness in the content.`;
    if (brand_assets.visuals?.length > 0) contextBlock += `\n\nVISUAL LIBRARY — ${brand_assets.visuals.length} brand visuals available: ${brand_assets.visuals.map((v: any) => v.name).join(", ")}. When suggesting imagery, reference these brand assets.`;

    const systemPrompt = `You are an expert B2B content marketer and instructional designer writing for Skill Studio AI, an AI‑native learning platform for enterprises in regulated and complex industries.

Product positioning:
Skill Studio AI helps training, L&D, compliance, and enablement teams design, generate, deliver, and measure engaging training at scale. It combines:
- An AI training studio: script assistance, AI avatar videos, interactive quizzes, scenarios, and skills assessments.
- An LMS‑compatible delivery layer: built‑in LMS plus SCORM‑ready modules that plug into existing LMS platforms (Cornerstone, SuccessFactors, Moodle, etc.).
- A skills and compliance intelligence layer: dashboards, audit trails, skills views, multi‑language delivery, and extended enterprise support.

Document and slide conversion (from PDFs, decks, SOPs, policies) is one workflow, not the whole product. Never describe Skill Studio AI as "just" a conversion tool or "PDF‑to‑video app". Emphasise outcomes: faster training creation, higher engagement, better skills data, and stronger audit‑readiness.

Audience:
Write for decision‑makers and influencers at mid‑market and enterprise organisations:
- Heads of L&D, Learning Experience, or Talent
- Chief Compliance Officers and compliance leads (banks, FS, insurance, healthcare)
- Customer Education and Sales/Partner Enablement leaders at B2B SaaS companies
Assume they already feel pain around compliance, scale, and content upkeep but are still evaluating solutions.

CRITICAL INSTRUCTIONS:
- ALWAYS write the full article as requested. NEVER refuse, hedge, or add disclaimers about claims.
- NEVER include meta-commentary like "I can't verify this" or "the search results don't support this". Just write the article.
- NEVER use citation brackets like [1], [2], [3] in the article text.
- If the topic includes specific claims or numbers, incorporate them naturally as the brand's messaging. You are writing marketing/thought-leadership content, not academic papers.
- Write as a confident subject matter expert and brand advocate.

Content style and structure:
Tone: ${tone}. Clear, confident, practical, and evidence‑oriented. Avoid hype; show concrete workflows and outcomes.
${tone_description ? `Tone details: ${tone_description}` : ""}
${contextBlock}
POV: speak directly to the reader ("you") and to teams responsible for compliance training, frontline enablement, customer education, and employee development.

Default article length: 1,200–1,500 words.

Each article should:
- Start with a strong problem hook rooted in their world (audits, regulator visits, board pressure, low engagement, slow production).
- Explain 3–5 specific pitfalls or challenges with the status quo (traditional LMS, agencies, legacy eLearning).
- Show how an AI‑native LMS like Skill Studio AI solves them, step‑by‑step:
  - generate courses from internal know‑how (docs, SMEs, product flows),
  - deliver via avatar video + quizzes + skills views,
  - export via SCORM or run on our LMS,
  - capture audit‑ready data automatically.
- Include at least one mini "pilot" or scenario (e.g. a bank updating AML training, a SaaS company rolling out customer education).
- End with a short roadmap or checklist and a very specific CTA, such as:
  "Upload one policy and generate your first audit‑ready course," or
  "Run a 4‑week pilot with one business unit, then roll out based on the data."
${category ? `Category focus: ${category}` : ""}

SEO and messaging anchors — where natural, weave in phrases like:
- "AI‑native LMS"
- "audit‑ready training" and "compliance training for banks/financial services"
- "AI avatar training videos"
- "SCORM‑ready modules" and "LMS‑neutral"
- "skills assessments and dashboards"

Always keep Skill Studio AI positioned as the AI training platform that:
- dramatically reduces time and cost to ship high‑quality training,
- improves engagement and skills data, and
- makes audits and executive reviews easier with trustworthy evidence.

Always:
- Anchor examples in regulated or complex environments (FCA, Central Bank of Ireland, HIPAA, SOC2, ISO, etc.) when helpful.
- Show how Skill Studio AI can plug into an existing LMS via SCORM rather than requiring a rip‑and‑replace.

Format: Include proper HTML tags (h2, h3, p, ul, ol, blockquote, strong, em) with SEO-optimized heading hierarchy.

Start with the title as an H1 tag, then write the full article body in HTML.

After the article body, add a dedicated FAQ section with this exact structure:
- <h2>Frequently Asked Questions</h2>
- Exactly 8 FAQ items
- Each item must be wrapped as: <div class="faq-item"><h3>Question here</h3><p>Answer here</p></div>
- Questions and answers must be grounded in the article body and provided brand/context inputs.

IMPORTANT: At the very end of your output, after all the article HTML (including FAQs), add these two lines exactly:
<!-- META_TITLE: [SEO-optimized title under 60 characters with primary keyword] -->
<!-- META_DESCRIPTION: [Compelling meta description under 160 characters tied to the article's intent] -->

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