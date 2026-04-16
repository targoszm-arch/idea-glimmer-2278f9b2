import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Article generation via Perplexity sonar-pro (web-grounded).
//
// Rewrite history:
//   Before: single ~2,000-word mega-prompt with `{{#if content_type}}` format
//   overrides ending in six CRITICAL reminders — a classic "patch drift with
//   more rules" antipattern that grew over time. Model frequently violated
//   tail-of-prompt rules and produced invalid JSON-LD script blocks.
//
//   Now: three focused templates (blog / user_guide / how_to) that share a
//   preamble. Output rules live at the TOP (beginning-of-prompt attention is
//   strong), format-specific content lives in the middle, metadata block at
//   the end. JSON-LD <script> generation is removed from the model entirely
//   — the model emits structured `faq_pairs` in ARTICLE_META_JSON and the
//   caller (NewArticle.tsx + contentlab-mcp) builds the schema server-side
//   where JSON syntax is guaranteed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PromptVars = {
  topic: string;
  tone: string;
  tone_description: string;
  category: string;
  app_description: string;
  app_audience: string;
  reference_urls: string[];
  // Blog-only media options. When true, the prompt asks the model to embed
  // placeholder comments in the body and emit matching prompt comments in
  // the metadata tail, so the caller can generate + substitute images
  // after the article is saved. Default false for both.
  include_inline_image?: boolean;
  include_infographic?: boolean;
};

function sharedPreamble(v: PromptVars): string {
  const contextLines: string[] = [];
  if (v.app_description) contextLines.push(`Product/App: ${v.app_description}`);
  if (v.app_audience) contextLines.push(`Target audience: ${v.app_audience}`);
  if (v.reference_urls.length > 0) contextLines.push(`Reference style: ${v.reference_urls.join(", ")}`);
  const contextBlock = contextLines.length > 0
    ? `${contextLines.join("\n")}\nWrite as a confident subject matter expert for this product/brand.\nIMPORTANT: Use your web knowledge to research this product/company. Include its specific value propositions, features, and differentiators organically throughout the article. Dedicate at least one section or subsection to how this product addresses the topic — with concrete details (pricing, features, integrations, use cases) from your research. The product should feel like a natural part of the analysis, not a bolted-on mention.`
    : "No specific product context provided. Write as a neutral industry expert.";

  return `
--------------------
OUTPUT FORMAT (READ FIRST)
--------------------

Your output MUST be pure, semantic HTML. No Markdown anywhere.

- Your very first character must be "<". No "\`\`\`html", no prose preamble.
- Every paragraph in <p> tags. No bare text outside HTML tags.
- No inline \`style\` attributes on any tag.
- No citation brackets like [1], [2], [3].
- No disclaimers or caveats after the closing metadata comments.
- Use <strong> for emphasis, never markdown bold (**text**).
- <h1> title must be under 60 characters.

Hyperlinks: wrap key terms or cited sources in <a href="URL">anchor text</a>.
If you cannot confirm a URL from your search results, omit the hyperlink entirely rather than guessing. Broken links damage credibility more than missing links.

--------------------
CONTEXT
--------------------

${contextBlock}

Tone: ${v.tone || "professional"}
${v.tone_description ? `Tone details: ${v.tone_description}` : ""}
${v.category ? `Category: ${v.category}` : "Category: general"}
`.trim();
}

function metadataTail(
  includeFaqPairs: boolean,
  includeInlineImage = false,
  includeInfographic = false,
): string {
  const faqField = includeFaqPairs
    ? `,
  "faq_pairs": [
    {"question": "Exact Q from FAQ section", "answer": "Exact A from FAQ section"}
  ]`
    : "";

  // Extra metadata lines the caller parses to drive post-generation image
  // creation. Only emitted when the corresponding flag is true — we don't
  // want the model guessing at prompts the caller isn't going to use.
  const inlineImageLine = includeInlineImage
    ? `\n<!-- INLINE_IMAGE_PROMPT: [vivid 10-15 word photorealistic scene that illustrates the article's single most important claim — NOT a repeat of the cover scene. Different subject, different angle.] -->`
    : "";
  const infographicLines = includeInfographic
    ? `\n<!-- INFOGRAPHIC_PROMPT: [15-25 words describing concretely what data, comparison, or process the infographic should visualize based on the article's actual content — reference real numbers, named items, or steps from the body.] -->\n<!-- INFOGRAPHIC_STYLE: [pick exactly one of: stats | comparison | timeline | process | general — based on which fits the INFOGRAPHIC_PROMPT above] -->`
    : "";

  return `
--------------------
METADATA (append after final HTML)
--------------------

<!-- META_TITLE: [exact H1 text] -->
<!-- META_DESCRIPTION: [one sentence, under 20 words, under 150 characters] -->
<!-- COVER_IMAGE_PROMPT: [vivid 10-15 word photorealistic scene representing the topic] -->${inlineImageLine}${infographicLines}
<!-- ARTICLE_META_JSON:
{
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tone": "[tone used]",
  "headings": ["H2 heading 1", "H2 heading 2", "H2 heading 3"],
  "sources": [
    {"title": "Source name", "url": "https://..."}
  ],
  "facts": [
    "Specific statistic or fact used in article"
  ],
  "primary_focus": "[main topic/entity]"${faqField}
}
-->

Do NOT output any <script type="application/ld+json"> tags yourself — the caller builds JSON-LD server-side from the metadata above so the JSON is always syntactically valid.
`.trim();
}

// Body-level instructions telling the model to embed placeholder HTML
// comments where inline images / infographics should go. The caller
// substitutes these with real <img> tags after generation completes.
function mediaPlacementInstructions(
  includeInlineImage: boolean,
  includeInfographic: boolean,
): string {
  if (!includeInlineImage && !includeInfographic) return "";
  const lines: string[] = [
    `\n--------------------`,
    `INLINE MEDIA PLACEMENT`,
    `--------------------`,
    ``,
    `The article will have visual assets inserted into the body. Place these HTML comment placeholders inline — the caller will substitute them with real <img> tags after generation. The placement you choose is final; put each placeholder at the exact point in the narrative where the visual will help the reader.`,
  ];
  if (includeInlineImage) {
    lines.push(
      ``,
      `- Insert exactly ONE <!-- INLINE_IMAGE_HERE --> comment in the body. Put it on its own line, between two <p> tags (NOT inside any tag). Best position: after the intro paragraph (before the first H2), or between two middle H2 sections where a visual break genuinely helps. Never inside the Table of Contents, Key Takeaways list, or FAQ block. Never before <h1> or after the final metadata.`,
    );
  }
  if (includeInfographic) {
    lines.push(
      ``,
      `- Insert exactly ONE <!-- INFOGRAPHIC_HERE --> comment in the body. Put it on its own line, between two top-level elements. Best position: immediately after a section that contains comparisons, named data points, or an enumerated process — somewhere a data visual actually earns its place. If the article has a comparison <table>, place the infographic directly after that section's closing </p>. Never inside the Table of Contents or the FAQ block.`,
    );
  }
  if (includeInlineImage && includeInfographic) {
    lines.push(
      ``,
      `- The inline image and the infographic must be placed at DIFFERENT sections — not adjacent, not in the same H2 block. Spread them through the article so the reader gets visual breaks in at least two distinct places.`,
    );
  }
  lines.push(
    ``,
    `- The INLINE_IMAGE_PROMPT and INFOGRAPHIC_PROMPT (in the metadata tail) must reference the SPECIFIC content you're illustrating at the placement point. The prompt for each visual must be derived from the section it's adjacent to, not from the overall topic.`,
  );
  return lines.join("\n");
}

function buildBlogPrompt(v: PromptVars): string {
  const includeInlineImage = !!v.include_inline_image;
  const includeInfographic = !!v.include_infographic;
  return `You are an expert AI content writer generating an SEO-ready article grounded in current web data.

${sharedPreamble(v)}

--------------------
CONTENT RULES
--------------------

- DETECT the article type from the topic (comparison / "vs", thought leadership, product deep dive, FAQ, listicle) and adapt structure accordingly.
- Answer-first: every section opens with a direct one-sentence answer, then elaborates.
- All H2 and H3 headings should be phrased as questions.
- Use concrete details from sources: pricing ranges, plan names, feature counts, integration names.
- Use HTML <table> for comparisons — never bullet lists or styled divs.
- Every section must include at least one specific number or named example. Replace "many companies" or "significant results" with data.
- Write with nuance: acknowledge competitor strengths honestly while clearly positioning the product. If product context is provided, weave the product's value proposition into the narrative — show how it solves the problem the article discusses, with specifics from your web research (features, pricing tiers, integration names, customer outcomes). This should read as expert analysis, not marketing copy.
- Vary sentence structure and paragraph length.

Word count: minimum 1,500 words. If your draft is under 1,400 words, expand the thinnest section with additional detail before finishing.

--------------------
ARTICLE STRUCTURE
--------------------

Follow this exact output order:

1. <h1>[Title — under 60 characters]</h1>

2. <p class="subtitle">[1-2 sentence summary of the article's core finding or recommendation]</p>

3. <nav>
     <h2>Contents</h2>
     <ol> with anchor links to each H2 below
   </nav>

4. <h2 id="key-takeaways">Key Takeaways</h2>
   <ul> with 6-10 bullets. Each: <strong>Bold label</strong> followed by one sentence.

5. <p>[2-3 sentence intro framing the article's purpose and what the reader will learn.]</p>

6. Main body sections:
   - Each H2 has an id attribute matching the Table of Contents anchor.
   - Lead every section with a 1-sentence direct answer, then elaborate.
   - Use question-based headings.
   - Use <table> for any comparison.
   - Include quantified proof points.

7. <h2 id="faqs">Frequently Asked Questions</h2>
   5-10 Q&A pairs, each as:
   <div class="faq-item">
     <h3>[Question]</h3>
     <p>[Answer — 2-4 sentences]</p>
   </div>

8. Closing metadata (see METADATA section below).
${mediaPlacementInstructions(includeInlineImage, includeInfographic)}

${metadataTail(true, includeInlineImage, includeInfographic)}`;
}

function buildUserGuidePrompt(v: PromptVars): string {
  return `You are an expert technical writer creating a step-by-step user guide grounded in current product documentation.

${sharedPreamble(v)}

--------------------
USER GUIDE STRUCTURE
--------------------

Follow this exact output order:

<h1>[Title — under 60 characters, e.g. "How to Set Up Your First Project"]</h1>

<h2>What You'll Accomplish</h2>
<p>[2-3 sentences: what the reader will learn and the end result they'll have.]</p>

<h2>Step 1 of N — [Action Title]</h2>
<p>[2-4 sentences. Be specific: what to click, where to navigate, what the user should see on screen. Use <strong>UI element names</strong> for buttons, menus, and fields.]</p>

<h2>Step 2 of N — [Action Title]</h2>
<p>[Same level of detail.]</p>

[Continue for all steps...]

<h2>Summary</h2>
<p>[Brief recap of what was accomplished across all steps. Optionally link to next guide or related feature.]</p>

--------------------
FORMATTING RULES
--------------------

- Step numbers appear ONLY inside the <h2> tag as "Step X of N". Never as a standalone number, paragraph, or line.
- Use <strong> for UI elements: <strong>Settings</strong>, <strong>Save</strong>.
- All headings use proper <h2> tags. No plain text headings.
- Keep each step focused on one action. If a step has sub-actions, use a <ol> list inside the step's paragraph.

${metadataTail(false)}`;
}

function buildHowToPrompt(v: PromptVars): string {
  return `You are an expert technical writer creating a practical how-to guide grounded in current web data and documentation.

${sharedPreamble(v)}

--------------------
HOW-TO GUIDE STRUCTURE
--------------------

Follow this exact output order:

<h1>[Title — under 60 characters, starting with "How to..."]</h1>

<p>[2-3 sentences: what this guide helps the reader accomplish and why it matters.]</p>

<h2>Prerequisites</h2>
<ul>
  <li>[What the reader needs before starting — tools, accounts, permissions, versions]</li>
</ul>

<h2>Steps</h2>
<ol>
  <li><strong>[Action verb + task]</strong> — [2-3 sentences: how to do it, what to look for, what the result should be.]</li>
  <li><strong>[Action verb + task]</strong> — [explanation]</li>
  [Continue for all steps]
</ol>

<h2>Tips and Best Practices</h2>
<ul>
  <li><strong>[Tip title]</strong> — [1-2 sentences of practical advice.]</li>
</ul>

<h2>Troubleshooting</h2>
<p>Common issues and how to resolve them:</p>

Provide 3-5 troubleshooting items. Each item MUST use this exact structure:

<h3>[Problem — phrased as what the user observes, e.g. "Build fails with permission error"]</h3>
<p><strong>Cause:</strong> [1-2 sentences explaining why this happens.]</p>
<p><strong>Fix:</strong> [3-4 sentences with specific actions: what to click, what to check, what setting to change, how to verify the fix worked.]</p>

[Repeat for each troubleshooting item]

--------------------
FORMATTING RULES
--------------------

- Steps must be inside a single <ol> element. Never use standalone numbers outside list items.
- All section titles use <h2>. All troubleshooting problem titles use <h3>. No plain-text headings.
- Troubleshooting fixes must be actionable and specific — never vague one-liners like "check your settings."

${metadataTail(false)}`;
}

function getSystemPrompt(contentType: string, vars: PromptVars): string {
  switch (contentType) {
    case "user_guide": return buildUserGuidePrompt(vars);
    case "how_to":     return buildHowToPrompt(vars);
    default:           return buildBlogPrompt(vars);
  }
}

function getUserMessage(contentType: string, topic: string): string {
  const base = `REMINDER: Output ONLY valid HTML. Start immediately with <h1>. No markdown, no plain text, no code fences. Every paragraph must be wrapped in <p> tags.`;
  if (contentType === "how_to") {
    return `Write a how-to guide about: ${topic}\n\n${base} ALL section titles must be <h2>. The Troubleshooting section is CRITICAL — each problem MUST use <h3> for the problem title, then <p><strong>Cause:</strong> ...</p> and <p><strong>Fix:</strong> ...</p> with detailed, actionable multi-sentence fixes.`;
  }
  if (contentType === "user_guide") {
    return `Write a user guide about: ${topic}\n\n${base} ALL section titles must be <h2>. Step numbers must ONLY appear inside <h2> tags. Do NOT output bare numbers as standalone text.`;
  }
  return `Write an article about: ${topic}\n\n${base}`;
}

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
    let parsedBody: any = null;

    if (isServiceRole) {
      const bodyText = await req.text();
      const bodyJson = JSON.parse(bodyText || '{}');
      const overrideId = bodyJson.user_id_override;
      if (!overrideId) {
        return new Response(JSON.stringify({ error: 'user_id_override required when using service role' }), { status: 400, headers: corsHeaders });
      }
      userId = overrideId;
      parsedBody = bodyJson;
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
      // Media options are blog-only; user guide + how-to have rigid
      // step structures that an inline image would break. The edge
      // function accepts the flags for any content_type but only
      // buildBlogPrompt honors them.
      include_inline_image = false,
      include_infographic = false,
    } = parsedBody ?? await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    const vars: PromptVars = {
      topic,
      tone,
      tone_description,
      category,
      app_description,
      app_audience,
      reference_urls,
      include_inline_image: content_type === "blog" && !!include_inline_image,
      include_infographic: content_type === "blog" && !!include_infographic,
    };
    const systemPrompt = getSystemPrompt(content_type, vars);
    const userMessage = getUserMessage(content_type, topic);

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
          { role: "user", content: userMessage },
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
