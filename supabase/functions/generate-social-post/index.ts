import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAIN_TEXT_RULE = `\n\nIMPORTANT: Output plain text only. Do NOT use any markdown formatting whatsoever — no #, ##, ###, **, *, -, bullet dashes, or any other markdown syntax. Use line breaks, spacing, and numbered lists (1. 2. 3.) for structure instead.`;

const platformPrompts: Record<string, string> = {
  linkedin: `Generate a professional LinkedIn post for Skill Studio AI.
Structure:
- Attention-grabbing hook (1-2 lines)
- Problem statement (2-3 lines)  
- Solution/insight with Skill Studio AI positioning (3-5 lines)
- Key takeaway or stat
- Clear CTA (e.g. "Comment below", "DM me", "Check the link in comments")
- 3-5 relevant hashtags

Keep it under 1,300 characters. Use line breaks for readability. Write in first person as a thought leader.${PLAIN_TEXT_RULE}`,

  youtube: `Generate YouTube video content for Skill Studio AI.
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

  twitter: `Generate a Twitter/X thread for Skill Studio AI.
Structure:
Tweet 1: Hook tweet that stops the scroll (under 280 chars)
Tweets 2-8: Each tweet covers one key point (each under 280 chars)
Final tweet: CTA + relevant hashtags

Format each tweet clearly as:
🧵 1/
🧵 2/
etc.

Make it punchy, use data points, and create curiosity gaps between tweets.${PLAIN_TEXT_RULE}`,

  instagram_carousel: `Generate an Instagram carousel post for Skill Studio AI.
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

  instagram_reel: `Generate an Instagram Reel script for Skill Studio AI.
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

  instagram_reel_multipage: `Generate a multipage Instagram Reel (swipeable image carousel designed as a Reel) for Skill Studio AI.
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
    
    const {
      platform,
      topic,
      tone = "Informative",
      tone_description = "",
      app_description = "",
      app_audience = "",
      reference_urls = [],
      brand_assets = { logos: [], visuals: [] },
    } = await req.json();

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    const platformPrompt = platformPrompts[platform];
    if (!platformPrompt) throw new Error(`Unknown platform: ${platform}`);

    let contextBlock = "";
    if (app_description) contextBlock += `\nApp/Product context: ${app_description}`;
    if (app_audience) contextBlock += `\nTarget audience: ${app_audience}`;
    if (reference_urls.length > 0) contextBlock += `\nIMPORTANT — Reference posts/content the user likes (study these for tone, structure, hooks, and style): ${reference_urls.join(", ")}. Analyse these links and generate content that matches their style, format, and engagement patterns.`;
    if (brand_assets.logos?.length > 0) contextBlock += `\n\nBRAND ASSETS — The brand has these logos available: ${brand_assets.logos.map((l: any) => l.name).join(", ")}. Reference and incorporate the brand identity in content recommendations. When suggesting visuals, include instructions to overlay/include the brand logo.`;
    if (brand_assets.visuals?.length > 0) contextBlock += `\n\nVISUAL LIBRARY — The brand has ${brand_assets.visuals.length} visual assets available. When suggesting visuals or image prompts for slides/posts, recommend using these brand visuals where appropriate instead of generic stock images. Available visuals: ${brand_assets.visuals.map((v: any) => v.name).join(", ")}.`;

    const systemPrompt = `You are an expert B2B social media content strategist writing for Skill Studio AI, an AI‑native learning platform for enterprises in regulated and complex industries.

Product positioning:
Skill Studio AI helps training, L&D, compliance, and enablement teams design, generate, deliver, and measure engaging training at scale. It combines:
- An AI training studio: script assistance, AI avatar videos, interactive quizzes, scenarios, and skills assessments.
- An LMS‑compatible delivery layer: built‑in LMS plus SCORM‑ready modules that plug into existing LMS platforms.
- A skills and compliance intelligence layer: dashboards, audit trails, skills views, multi‑language delivery.

Never describe Skill Studio AI as "just" a conversion tool. Emphasise outcomes: faster training creation, higher engagement, better skills data, and stronger audit‑readiness.

Tone: ${tone}. Clear, confident, practical. Avoid hype.
${tone_description ? `Tone details: ${tone_description}` : ""}
${contextBlock}

CRITICAL: Write the content directly. No meta-commentary. No disclaimers. No citation brackets.

${platformPrompt}`;

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
          { role: "user", content: `Create ${platform.replace("_", " ")} content about: ${topic}` },
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
