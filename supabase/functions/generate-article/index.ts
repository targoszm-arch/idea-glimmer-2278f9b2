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
      content_type = "blog",
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
- Hyperlinks: where relevant, wrap key terms or cited sources in <a href="URL">anchor text</a> tags. Use real, credible URLs. Never use plain text URLs — always use proper HTML anchor tags.

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
CRITICAL: Your VERY FIRST character must be "<". Do NOT write "html", "```html", "```", or any other text before the opening tag.
CRITICAL: Article title in <h1> MUST be under 60 characters.
CRITICAL: NEVER include citation brackets like [1], [2], [3].
CRITICAL: NEVER append disclaimers or caveats after the META comments.
CRITICAL: At the very end, after META comments, add: <!-- COVER_IMAGE_PROMPT: [a vivid 10-15 word photorealistic scene that represents this article's topic] -->
CRITICAL: After COVER_IMAGE_PROMPT, add this metadata block (fill in all fields from your research):
<!-- ARTICLE_META_JSON:
{
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tone": "[the writing tone used, e.g. informative, casual, professional]",
  "headings": ["H2 heading 1", "H2 heading 2", "H2 heading 3"],
  "sources": [
    {"title": "Source name", "url": "https://..."},
    {"title": "Source name", "url": "https://..."}
  ],
  "facts": [
    "Specific statistic or fact used in article",
    "Another key fact with number or data point"
  ],
  "primary_focus": "[main topic/entity the article is about]"
}
-->
CRITICAL: Write as a confident subject matter expert for this product/brand.
${content_type === "user_guide" ? `
--------------------
USER GUIDE FORMAT OVERRIDE
--------------------
IGNORE the blog article structure above. Instead, generate a USER GUIDE with this exact HTML structure:

<h1>[Title under 60 characters]</h1>

<h2>What You'll Accomplish</h2>
<p>[2-3 sentences summarising what the reader will learn and the end result]</p>

<h2>Step 1 of N — [Action title]</h2>
<p>[Detailed explanation of this step, 2-4 sentences. Be specific about what to click, where to navigate, and what the user should see.]</p>

<h2>Step 2 of N — [Action title]</h2>
<p>[Detailed explanation]</p>

[Continue for all steps...]

<h2>Summary</h2>
<p>[Brief recap of what was accomplished across all steps]</p>

CRITICAL: Do NOT output standalone numbers before or outside the headings. The step number must ONLY appear inside the <h2> tag as "Step X of N". NEVER output a bare number like "1", "2", "3" as its own paragraph, line, or text node.
CRITICAL: Do NOT output "Step X of N" as a separate line or paragraph — it must ONLY be part of the <h2> heading tag.
CRITICAL: Do NOT use markdown bold (**text**). Use <strong>text</strong> for emphasis.
CRITICAL: ALL headings must use proper <h2> tags. No plain text headings.
CRITICAL: Output pure HTML. Every paragraph in <p> tags. No markdown at all. No bare text outside of HTML tags.
` : ""}${content_type === "how_to" ? `
--------------------
HOW-TO GUIDE FORMAT OVERRIDE
--------------------
IGNORE the blog article structure above. Instead, generate a HOW-TO GUIDE with this exact HTML structure:

<h1>[Title under 60 characters]</h1>
<p>[2-3 sentence intro explaining what this guide helps the reader accomplish and why it matters]</p>

<h2>Prerequisites</h2>
<ul>
  <li>[Prerequisite 1 — what the reader needs before starting]</li>
  <li>[Prerequisite 2]</li>
</ul>

<h2>Steps</h2>
<ol>
  <li><strong>[Action verb + task]</strong> — [2-3 sentence detailed explanation of how to do this step, what to look for, and what the result should be]</li>
  <li><strong>[Action verb + task]</strong> — [explanation]</li>
</ol>

<h2>Tips &amp; Best Practices</h2>
<ul>
  <li><strong>[Tip title]</strong> — [Practical advice, 1-2 sentences]</li>
</ul>

<h2>Troubleshooting</h2>
<p>Common issues and how to resolve them:</p>

<h3>[Problem description — phrased as what the user observes]</h3>
<p><strong>Cause:</strong> [1-2 sentences explaining why this happens technically]</p>
<p><strong>Fix:</strong> [3-4 sentences with specific step-by-step actions: what to click, what to check, what setting to change, and how to verify the fix worked]</p>

<h3>[Another problem the user might encounter]</h3>
<p><strong>Cause:</strong> [technical explanation]</p>
<p><strong>Fix:</strong> [detailed step-by-step resolution]</p>

MANDATORY: Include 3-5 troubleshooting items. Each item MUST have:
- A <h3> tag for the problem title (NEVER plain text)
- A <p><strong>Cause:</strong> ...</p> paragraph
- A <p><strong>Fix:</strong> ...</p> paragraph with ACTIONABLE steps (not vague one-liners)
NEVER output troubleshooting problems as plain text paragraphs without <h3> tags.

CRITICAL: Steps must be inside a single <ol><li>...</li></ol> structure. Do NOT use standalone numbers outside list items. NEVER output a bare number like "1", "2", "3" as its own paragraph, line, or text node.
CRITICAL: Do NOT output "Step X of N" as a separate line — only inside headings if used.
CRITICAL: Do NOT use markdown bold (**text**). Use <strong>text</strong> for HTML bold.
CRITICAL: ALL section titles must use <h2> tags. ALL troubleshooting problem titles must use <h3> tags. No plain text headings.
CRITICAL: Output pure HTML. No markdown syntax anywhere. No bare text outside of HTML tags.
` : ""}
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
          { role: "user", content: content_type === "how_to"
            ? `Write a how-to guide about: ${topic}\n\nREMINDER: Output ONLY valid HTML. Start immediately with <h1>. No markdown, no plain text, no code fences. Every paragraph must be wrapped in <p> tags. ALL section titles must be <h2>. The Troubleshooting section is CRITICAL — each problem MUST use <h3> for the problem title, then <p><strong>Cause:</strong> ...</p> and <p><strong>Fix:</strong> ...</p> with detailed, actionable multi-sentence fixes. Do NOT output plain text without tags.`
            : content_type === "user_guide"
            ? `Write a user guide about: ${topic}\n\nREMINDER: Output ONLY valid HTML. Start immediately with <h1>. No markdown, no plain text, no code fences. Every paragraph must be wrapped in <p> tags. ALL section titles must be <h2>. Step numbers must ONLY appear inside <h2> tags. Do NOT output bare numbers as standalone text.`
            : `Write an article about: ${topic}\n\nREMINDER: Output ONLY valid HTML. Start immediately with <h1>. No markdown, no plain text, no code fences. Every paragraph must be wrapped in <p> tags.` },
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
