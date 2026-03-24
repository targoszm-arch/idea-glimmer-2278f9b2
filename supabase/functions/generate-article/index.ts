import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = authHeader.replace('Bearer ', '').trim();
    const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let userId: string;

    if (isServiceRole) {
      // Called from automation runner — get user_id from body
      const bodyText = await req.text();
      const bodyJson = JSON.parse(bodyText || '{}');
      const overrideId = bodyJson.user_id_override;
      if (!overrideId) {
        return new Response(JSON.stringify({ error: 'user_id_override required when using service role' }), { status: 400, headers: corsHeaders });
      }
      userId = overrideId;
      // Re-attach body for later parsing
      (req as any)._parsedBody = bodyJson;
    } else {
      const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      userId = user.id;
    }

    const { data: hasCredits } = await supabaseAdmin.rpc('deduct_credits', { p_user_id: userId, p_amount: 5, p_action: 'generate_article' });
    if (!hasCredits) {
      return new Response(JSON.stringify({ error: 'Insufficient credits', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const {
      topic,
      tone = "Informative",
      tone_description = "",
      category = "",
      app_description = "",
      app_audience = "",
      reference_urls = [],
    } = (req as any)._parsedBody ?? await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    // Build dynamic context from user's own settings — no hardcoded brand
    let contextBlock = "";
    if (app_description) contextBlock += `\nProduct/App context: ${app_description}`;
    if (app_audience) contextBlock += `\nTarget audience: ${app_audience}`;
    if (reference_urls.length > 0) contextBlock += `\nReference content to emulate style from: ${reference_urls.join(", ")}`;

    const systemPrompt = `
You are an expert AI content writer. Your job is to generate high-quality, SEO-ready articles (1,500–2,000 words) grounded in current web data.
${contextBlock ? `\nIMPORTANT CONTEXT ABOUT THIS PRODUCT/BRAND:\n${contextBlock}\n` : ""}
You MUST:

- Do NOT include any inline \`style\` attributes on any HTML tags. Output clean, unstyled semantic HTML only.
- Read the topic and DETECT the article type (comparison / "vs", how-to, thought leadership, product deep dive, FAQ, etc.).
- Adapt the structure to the article type.
- Use concrete, accurate details from sources (pricing ranges, plan names, feature counts, integration names).
- Write with nuance: acknowledge competitor strengths honestly while clearly positioning the user's product.
- Vary sentence structure.
- Use natural, keyword-rich subheadings.
- Include a \`<!-- META_TITLE: ... -->\` and \`<!-- META_DESCRIPTION: ... -->\` comment at the end.
- End with an FAQ section of 5–10 questions and answers unless explicitly disabled.

Word count guideline: aim for 1,500–2,000 words when the topic allows. Shorter is acceptable only if the topic is genuinely narrow.

--------------------
MANDATORY ARTICLE STRUCTURE
--------------------

Every article MUST follow this exact structure:

**A. TL;DR (immediately after the <h1> title)**
First, output a 1–2 sentence TL;DR immediately after the <h1>.
Then, after the Table of Contents, output an expanded TL;DR section:
- <h2 id="tldr">TL;DR: [Core topic summary]</h2>
- <ul> with 6–10 key takeaways. Each bullet: <strong>bold label</strong> followed by one sentence.

**B. Table of Contents**
- <nav> with <h2>Contents</h2> and <ol> list with anchor links to each H2.
- Each H2 in the body must have a matching id attribute.

**C. Short intro paragraph**
- 2–3 sentences framing the article's purpose and what the reader will learn.

**D. Main body sections**
- EVERY section must follow Answer-First Structure: lead with a 1-sentence direct answer, then elaborate.
- ALL H2 and H3 headings should be question-based.
- Use HTML comparison tables (<table>) — never styled divs or images for comparisons.
- Include quantified proof points with specific numbers.
- Each H2 must have an id attribute matching the Table of Contents anchor.

**E. FAQ section (5–10 Q&A pairs)**
- <h2 id="faqs">FAQs</h2>
- Format: <div class="faq-item"><h3>Question</h3><p>Answer</p></div>
- FAQ questions MUST use <h3> tags. NEVER use <strong> or bold text for FAQ questions.
- Include as FAQPage JSON-LD schema.

**F. JSON-LD Structured Data (REQUIRED)**
After the FAQ section, append TWO <script type="application/ld+json"> blocks:

1. FAQPage schema matching the FAQ section exactly.

2. BlogPosting schema — populate ALL fields from the article you are generating:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "[The exact H1 title]",
  "description": "[The exact META_DESCRIPTION value]",
  "datePublished": "[Today's date ISO 8601]",
  "dateModified": "[Today's date ISO 8601]",
  "articleSection": "[The category]"
}
</script>

--------------------
AEO CONTENT RULES
--------------------

- Answer-first: every section opens with a direct one-sentence answer, then elaborates.
- Headings as questions: all H2 and H3 use question format.
- Comparison tables: use <table> HTML, never bullet lists.
- Quantified claims: every section includes at least one specific number.
- No vague language: replace "many companies," "significant results" with named examples and specific figures.
- FAQ section: always present, always matches FAQPage JSON-LD exactly.

--------------------
OUTPUT FORMAT
--------------------

Your output MUST be pure HTML (NOT Markdown).

Output order:
1. Article title as <h1>
2. TL;DR line (1–2 sentences)
3. Table of Contents nav
4. Expanded TL;DR section with 6–10 bullets
5. Short intro paragraph
6. Main body sections with id attributes on all H2s
7. FAQ section with 5–10 Q&A pairs
8. TWO JSON-LD blocks: FAQPage, BlogPosting
9. At the very end: \`<!-- META_TITLE: ... -->\` and \`<!-- META_DESCRIPTION: ... -->\`

CRITICAL: Output ONLY valid HTML. No Markdown. Every paragraph in <p> tags.
CRITICAL: Article title in <h1> MUST be under 60 characters.
CRITICAL: NEVER include citation brackets like [1], [2], [3].
CRITICAL: NEVER append disclaimers or caveats after the META comments.
CRITICAL: Write as a confident subject matter expert for this product/brand.

Tone: ${tone}. ${tone_description ? `Tone details: ${tone_description}` : ""}
${category ? `Category focus: ${category}` : ""}
`;

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
