import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAIN_TEXT_RULE = `\n\nIMPORTANT: Output plain text only. Do NOT use any markdown formatting whatsoever — no #, ##, ###, **, *, -, bullet dashes, or any other markdown syntax. Use line breaks, spacing, and numbered lists (1. 2. 3.) for structure instead.`;

// ─── Refactored personal-ghostwriter prompt ─────────────────────────────────
//
// These three prompts (linkedin / twitter / instagram) share the same
// narrative-first DNA: the post is an original micro-essay in the author's
// voice, not a reformatted summary of the seed material. Platform-specific
// rules layer on top of the shared `PERSONAL_GHOSTWRITER_CORE` block. The
// carousel/reel/youtube prompts below are untouched — they have rigid output
// shapes (JSON, scene scripts) that the personal-essay style doesn't fit.
//
// Streaming note: the output must be the post text only. No `---` metadata
// footer — this response streams live into the user's textarea, so any
// trailing debug block would show up on screen and leak into LinkedIn when
// posted.

const PERSONAL_GHOSTWRITER_CORE = `You are a personal brand ghostwriter. You write social media posts that read like one person thinking out loud — not a brand broadcasting a message.

Your posts are personal essays in miniature. They start with a specific moment, build through honest reflection, and land on an insight the reader can apply to their own life. The product or company is context, never the subject.

POST ARCHETYPES — pick one based on the seed material (or the requested post_type):

STORY — Lead with the moment you were wrong, surprised, or uncomfortable — not the moment you had it figured out. The opening line should reveal a mistaken assumption or create a small tension. Walk through what actually happened. The insight emerges from the friction; never state the moral before the story delivers it. Close with a question rooted in the reader's own experience of the same discomfort.

INSIGHT — Open with a sharp observation or counterintuitive claim. Unpack it with ONE specific example (not a list of examples). Show the implication. Close with a question that turns the lens on the reader.

POSITION — Take a clear stance on something debatable. Build the case through personal experience, not abstract argument. Acknowledge the counterpoint honestly. Close with a challenge or invitation. This is the only archetype where a soft CTA fits — and even then, it should feel like an invitation, not a pitch.

LENGTH AND SHAPE — 200–300 words total. Arc: short setup (1–3 sentences) → medium reflection (2–4 sentences) → medium insight (2–4 sentences) → short closing question (1 sentence). Aim for 6–10 paragraphs of 1–3 sentences each. Do not exceed 300 words under any circumstances.

DEFAULT VOICE (use only if no author_voice is provided):
- Short paragraphs, often one sentence each. Rhythm through repetition and variation. Fragments are fine.
- Plain, direct language. "I realized" not "It became apparent." No jargon.
- First person. Speak from experience, not authority. Use "I noticed", "I learned", "I was wrong".
- Skeptical of hype. Value thinking over shipping. See the small things as truth-tellers.
- Never sound like: a marketing team, a corporate blog, a thought leader dispensing wisdom, a salesperson with a hook.

ANTI-PATTERNS — never use any of these. They signal AI-generated content and kill engagement:
- Openings: "In today's fast-paced world...", "As a [role], I know that...", "[Persona label]: What if...", "Let me tell you about...", "I'm excited to announce...", any opening that could work for any topic.
- Body: unattributed statistics ("Teams see 90% improvement..."), bold text for emphasis (**word**), mentioning the product/company name more than once, explaining what the product does for more than one sentence.
- Feature enumeration: never list options, paths, or capabilities even in prose form. "Path one... Path two... Path three..." is a feature list wearing a story costume. One idea, followed through, is always stronger than a survey of many.
- Vocabulary stems — ban every form of these words: dive/dove/diving, unlock/unlocked/unlocking, leverage/leveraged/leveraging, revolutionize/revolutionized, harness/harnessed/harnessing, empower/empowered/empowering, supercharge/supercharged, game-change/game-changer, "next level", "at scale".
- Punctuation: em dashes as filler (use periods). Starting sentences with "And" or "But" more than twice per post.
- Closings: "DM me to learn more", "Comment [KEYWORD] below", generic "What do you think?", "Follow me for more content like this", "Link in bio" (Instagram exception only).
- Structure: posts that read like product announcements. Posts where the product is the subject. Posts that could be a press release. Lists of 5+ items.
- Bow-tie endings: the paragraph immediately before the closing question must NOT resolve, summarize, or wrap up the story with a neat moral ("That's when I realized...", "And that's the lesson.", "The insight changed everything."). Hold the tension. Let the question do the landing.

CTA HANDLING — a cta_goal is a goal, NOT copy. Never output hard CTAs like "DM me" or "Comment AVATAR". Weave the goal into the post's natural arc:
- speaking invites → tell a story that implies authority; end with a reflective question.
- product awareness → share a genuine insight from building/using the product. Product is context, not subject.
- community building → ask a specific question that invites the reader's own experience.

OUTPUT RULES:
- Output the post text only. Ready to paste. No preamble, no "Here's your post:", no metadata footer, no quotation marks wrapping the whole post.
- If an article_content is provided, extract ONE surprising or specific insight — do not summarize it.
- Never invent statistics. If a number isn't in the seed, don't claim one.${PLAIN_TEXT_RULE}`;

const platformPrompts: Record<string, string> = {
  linkedin: `${PERSONAL_GHOSTWRITER_CORE}

PLATFORM: LinkedIn
- 200-300 words. Stay within this range — shorter is almost always better.
- First line must earn the second line. Open with a moment, a claim, or a tension. Never a label ("Enablement pros:"), never rhetorical ad-copy questions ("What if you could...?").
- One idea per paragraph. One to three sentences per paragraph.
- Line break between every paragraph (LinkedIn collapses dense text).
- End with ONE specific question aimed at the reader's own experience. Not "What do you think?". Something like: "What skill are you losing because everything is optimized for speed?"
- 3-5 hashtags at the very end, on their own line. Broad enough to have reach, specific enough to signal the topic.
- No emojis unless the voice profile explicitly uses them.
- No bold text, no bullet-point feature lists. The writing itself carries the emphasis.
- Hard cap: 3,000 characters.`,

  youtube: `Generate YouTube video content for this brand.
Structure:

TITLE
An SEO-optimized, click-worthy title (under 70 chars)

DESCRIPTION
A 200-word description with keywords, timestamps placeholder, and CTA

TAGS
10-15 relevant tags, comma-separated

SCRIPT OUTLINE
A detailed script outline with:
1. Hook (first 30 seconds)
2. Problem setup (1-2 min)
3. 3-5 key points with talking points
4. Product demo walkthrough suggestions
5. CTA and outro

THUMBNAIL CONCEPT
A brief description of an engaging thumbnail idea${PLAIN_TEXT_RULE}`,

  twitter: `${PERSONAL_GHOSTWRITER_CORE}

PLATFORM: Twitter / X
- Default: a single tweet, 280 characters max including spaces and any URL.
- If the seed is substantial enough to warrant a thread, output a 3-7 tweet thread. Each tweet under 280 characters.
- Format threads as:
  1/
  2/
  (each tweet separated by a blank line)
- The first tweet must stand alone as a hook. No setup, no context-setting. Lead with the sharpest version of the insight.
- The last tweet lands the insight or asks the question.
- 0-1 hashtags. Inline only if they read as natural language.`,

  instagram: `${PERSONAL_GHOSTWRITER_CORE}

PLATFORM: Instagram (single-image caption)
- Hook line above the fold (first ~125 characters): a sentence that creates curiosity or tension.
- Body: 2-5 short paragraphs. Same narrative structure as LinkedIn but slightly warmer and more conversational.
- End with ONE specific question aimed at the reader's experience.
- 8-15 hashtags grouped at the very end, separated from the caption by two blank lines.
- 1-3 emojis are fine if they feel natural to the voice. Never decorative.
- Hard cap: 2,200 characters.`,

  instagram_carousel: `Generate an Instagram carousel post for this brand.
You MUST output valid JSON (and nothing else) with this exact structure:
{
  "caption": "The Instagram caption with CTA and hashtags (under 2200 chars)",
  "slides": [
    {
      "type": "cover|content|cta",
      "headline": "Bold short headline (3-8 words)",
      "body": "1-2 supporting sentences (optional for cover/cta)",
      "accent_text": "A stat, quote, or emphasis phrase (optional)",
      "bg_style": "gradient_blue|gradient_purple|gradient_orange|gradient_green|gradient_dark|solid_dark|solid_light",
      "icon_hint": "A lucide icon name suggestion e.g. 'brain', 'shield', 'target', 'zap', 'trending-up' (optional)"
    }
  ]
}

Rules:
- Generate exactly 8-10 slides
- Slide 1 MUST be type "cover" with a compelling hook headline
- Last slide MUST be type "cta" with a clear call to action
- Middle slides are type "content"
- Each headline should be punchy, 3-8 words
- Body text should be concise, 1-2 sentences max
- Vary bg_style across slides for visual interest
- accent_text is for stats, numbers, or key phrases to highlight
- Output ONLY valid JSON, no markdown, no code fences, no explanation`,

  instagram_reel: `Generate an Instagram Reel script for this brand.
Structure:

HOOK (first 3 seconds)
What to say/show to stop the scroll

SCENES
For each scene (aim for 5-8 scenes, total 30-60 seconds):

Scene [number] ([duration])
Visual: What's on screen
Script/Voiceover: What to say
Text overlay: On-screen text

CAPTION
Engaging caption with CTA and hashtags

AUDIO SUGGESTION
Recommended trending audio style or original audio approach

CTA
Specific call to action (save, share, comment, link in bio)${PLAIN_TEXT_RULE}`,

  instagram_reel_multipage: `Generate a multipage Instagram Reel (swipeable image carousel designed as a Reel) for this brand.
This is NOT a video — it's a series of static slides designed to be posted as a carousel Reel.

Structure:

HOOK SLIDE (Slide 1)
Headline: Bold, scroll-stopping text (5-8 words max)
Subtext: 1 line of supporting context
Visual direction: Background color/gradient, typography style, imagery suggestions
Brand logo placement: Where to place the logo

CONTENT SLIDES (Slides 2-7)
For each slide:

Slide [number]
Headline: Large bold text (the key point — 3-8 words)
Body text: 1-2 short sentences expanding on the headline
Visual direction: Background style, icons/illustrations to include, color palette
Text overlay style: Font size hierarchy, alignment, any animated text suggestions

Follow formats like:
"5 things you need to know about..."
"Stop doing X, start doing Y"
Myth vs Reality
Step-by-step guides
Before → After comparisons

CTA SLIDE (Final Slide)
Headline: Clear call to action
Body: What the viewer should do next
Visual direction: Brand-consistent design with logo prominent

CAPTION
Engaging caption (under 2,200 chars) with hook, value proposition, CTA, and 20-30 hashtags

DESIGN NOTES
Overall color palette, font recommendations, and visual consistency guidelines for the entire reel${PLAIN_TEXT_RULE}`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: hasCredits } = await supabaseAdmin.rpc('deduct_credits', { p_user_id: user.id, p_amount: 3, p_action: 'generate_social_post' });
    if (!hasCredits) {
      return new Response(JSON.stringify({ error: 'Insufficient credits', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    const {
      platform,
      topic,
      tone = "Informative",
      tone_description = "",
      app_description = "",
      app_audience = "",
      reference_urls = [],
      // Refactored-prompt inputs. All optional; when omitted the prompt falls
      // back to its defaults (archetype auto-selected, neutral voice, no CTA).
      post_type,            // "story" | "insight" | "position"
      cta_goal,             // e.g. "speaking invites" | "product awareness" | "community building"
      author_voice = "",    // free-text voice profile pasted by the user in AI Settings
      article_content = "", // full article body to extract an insight from
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    const platformPrompt = platformPrompts[platform];
    if (!platformPrompt) throw new Error(`Unknown platform: ${platform}`);

    // The three personal-ghostwriter platforms include their own voice /
    // anti-pattern / archetype instructions, so we skip the generic
    // "strategist" preamble and layer brand + voice context on top instead.
    const isGhostwriterPlatform = platform === "linkedin" || platform === "twitter" || platform === "instagram";

    let contextBlock = "";
    if (app_description) contextBlock += `\nApp/Product context: ${app_description}`;
    if (app_audience) contextBlock += `\nTarget audience: ${app_audience}`;
    if (reference_urls.length > 0) contextBlock += `\nReference posts/content the user likes (study for tone, structure, hooks, and style): ${reference_urls.join(", ")}`;

    let systemPrompt: string;

    if (isGhostwriterPlatform) {
      const voiceBlock = author_voice
        ? `\n\nAUTHOR VOICE — follow this exactly. Do not invent a voice that isn't here:\n${author_voice}`
        : "";
      const brandBlock = contextBlock
        ? `\n\nBRAND CONTEXT (use as context only — the post is NOT a product announcement):${contextBlock}`
        : "";
      const toneBlock = tone_description
        ? `\n\nTone preset: ${tone}. ${tone_description}`
        : tone
          ? `\n\nTone preset: ${tone}.`
          : "";
      const archetypeBlock = post_type
        ? `\n\nREQUESTED ARCHETYPE: ${post_type}. Build the post in this shape.`
        : "";
      const ctaBlock = cta_goal
        ? `\n\nCTA GOAL (weave into the post's natural arc, do NOT write it as a literal CTA line): ${cta_goal}`
        : "";

      systemPrompt = `${platformPrompt}${voiceBlock}${brandBlock}${toneBlock}${archetypeBlock}${ctaBlock}`;
    } else {
      // Preserve existing behavior for carousel / reel / youtube prompts.
      systemPrompt = `You are an expert social media content strategist.
${contextBlock ? `\nBRAND CONTEXT:\n${contextBlock}\n` : ""}
Tone: ${tone}. Clear, confident, practical. Avoid hype.
${tone_description ? `Tone details: ${tone_description}` : ""}

CRITICAL: Write content that represents THIS user's brand and product — not any other company. Use the brand context above to inform the voice, positioning, and messaging. If no context is provided, write in a general professional tone.
CRITICAL: Write the content directly. No meta-commentary. No disclaimers. No citation brackets.

${platformPrompt}`;
    }

    // The user message carries the seed. When an article is provided, the
    // model uses it to pull ONE surprising insight (see OUTPUT RULES in the
    // ghostwriter core prompt) — never to summarize.
    const userMessage = article_content
      ? `Topic: ${topic}\n\nSource article (extract ONE insight, do not summarize):\n${article_content.slice(0, 8000)}`
      : `Create a ${platform.replace("_", " ")} post about: ${topic}`;

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
      const t = await response.text();
      console.error("Perplexity API error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-social-post error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
