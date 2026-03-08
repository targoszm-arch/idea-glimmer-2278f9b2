import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const platformPrompts: Record<string, string> = {
  linkedin: `Generate a professional LinkedIn post for Skill Studio AI.
Structure:
- Attention-grabbing hook (1-2 lines)
- Problem statement (2-3 lines)  
- Solution/insight with Skill Studio AI positioning (3-5 lines)
- Key takeaway or stat
- Clear CTA (e.g. "Comment below", "DM me", "Check the link in comments")
- 3-5 relevant hashtags

Keep it under 1,300 characters. Use line breaks for readability. Write in first person as a thought leader.`,

  youtube: `Generate YouTube video content for Skill Studio AI.
Structure:
## Title
An SEO-optimized, click-worthy title (under 70 chars)

## Description
A 200-word description with keywords, timestamps placeholder, and CTA

## Tags
10-15 relevant tags, comma-separated

## Script Outline
A detailed script outline with:
- Hook (first 30 seconds)
- Problem setup (1-2 min)
- 3-5 key points with talking points
- Product demo walkthrough suggestions
- CTA and outro

## Thumbnail Concept
A brief description of an engaging thumbnail idea`,

  twitter: `Generate a Twitter/X thread for Skill Studio AI.
Structure:
- Tweet 1: Hook tweet that stops the scroll (under 280 chars)
- Tweets 2-8: Each tweet covers one key point (each under 280 chars)
- Final tweet: CTA + relevant hashtags

Format each tweet clearly as:
🧵 1/
🧵 2/
etc.

Make it punchy, use data points, and create curiosity gaps between tweets.`,

  instagram_carousel: `Generate an Instagram carousel post for Skill Studio AI.
Structure:
## Caption
An engaging caption (under 2,200 chars) with CTA and hashtags

## Slides (generate 7-10 slides)
For each slide:
### Slide [number]
**Headline:** (bold, short text for the slide)
**Body:** (1-2 supporting sentences)
**Image prompt:** (a description of what visual/graphic to create for this slide)

Slide 1 should be a cover slide with a hook.
Last slide should be a CTA slide.`,

  instagram_reel: `Generate an Instagram Reel script for Skill Studio AI.
Structure:
## Hook (first 3 seconds)
What to say/show to stop the scroll

## Scenes
For each scene (aim for 5-8 scenes, total 30-60 seconds):
### Scene [number] ([duration])
**Visual:** What's on screen
**Script/Voiceover:** What to say
**Text overlay:** On-screen text

## Caption
Engaging caption with CTA and hashtags

## Audio suggestion
Recommended trending audio style or original audio approach

## CTA
Specific call to action (save, share, comment, link in bio)`,
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
