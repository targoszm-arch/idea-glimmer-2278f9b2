// Targeted meta-description generator. Uses Anthropic Haiku — fast, cheap,
// and well-suited to short metadata copy with strict character budgets.
//
// Why a dedicated function (not part of generate-article):
//   The general article system prompt produces a generic META_DESCRIPTION as
//   part of the metadata tail. A *good* meta description is a separate task:
//   keyword-bolded, brand-tone, USP-aware, ≤155 chars. Author drives it
//   explicitly with their own inputs.
//
// Body shape:
// {
//   title: string,
//   excerpt?: string,           // optional — first ~300 chars of article body
//   keywords: string[],         // 1-5 search terms to weave in (will be highlighted in SERP if matched)
//   brand_message?: string,     // strapline — "why us"
//   marketing_message?: string, // "why now" — the compelling pitch
//   usps?: string,              // value adds, offers, CTA
//   brand_tone?: string,        // e.g. "expert, direct, no marketing fluff"
//   example?: string,           // optional good-example to mirror in style (NOT copy)
//   max_chars?: number,         // default 155 (Google's typical truncation point)
// }
//
// Returns: { meta_description: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      title = "",
      excerpt = "",
      keywords = [],
      brand_message = "",
      marketing_message = "",
      usps = "",
      brand_tone = "",
      example = "",
      max_chars = 155,
    } = await req.json();

    if (!title.trim()) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const kws = (keywords as string[]).filter(Boolean).slice(0, 5);

    const systemPrompt = `You write meta descriptions for SEO. One single description per request.

Rules:
- HARD LIMIT: ${max_chars} characters. Count carefully. Going over gets your output truncated by Google mid-sentence.
- Plain text only. No quotes around the output. No HTML. No emojis unless the brand tone explicitly calls for them.
- Weave the supplied keywords in naturally — Google bolds matched terms in the SERP, so they should feel like part of the sentence, not stuffed.
- Brand message answers "why us". Marketing message answers "why now". USP/CTA answers "what do I get if I click".
- One coherent sentence (or two short ones). No filler ("Discover the best...", "Learn more about..."). Open with substance.
- Do NOT use any of these hype phrases: "game-changing", "revolutionary", "cutting-edge", "seamlessly", "unlock", "elevate", "harness the power of".
- Output ONLY the meta description text. No labels, no preamble, no trailing notes.`;

    const userMessage = `TITLE: ${title.trim()}

${excerpt.trim() ? `ARTICLE EXCERPT (for context only — do not summarize literally):\n${excerpt.trim().slice(0, 500)}\n\n` : ""}KEYWORDS to weave in: ${kws.length ? kws.join(", ") : "(none provided — focus on title's core noun phrase)"}
BRAND MESSAGE / STRAPLINE: ${brand_message.trim() || "(none)"}
COMPELLING MARKETING MESSAGE (why now): ${marketing_message.trim() || "(none)"}
USPs / VALUE ADDS / OFFER / CTA: ${usps.trim() || "(none)"}
BRAND TONE: ${brand_tone.trim() || "expert, direct, no marketing fluff"}
${example.trim() ? `\nGOOD EXAMPLE TO MIRROR IN STYLE (do NOT copy phrasing — just match cadence, density, and voice):\n"${example.trim().slice(0, 300)}"` : ""}

Write ONE meta description, ≤${max_chars} characters, plain text only.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Haiku 4.5 — fast and cheap; ideal for short, constrained metadata.
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let text: string =
      data?.content?.[0]?.text ?? data?.content?.[0]?.input ?? "";
    text = text.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ");

    // Hard-cut to max_chars at last word boundary so we never ship a
    // truncated mid-word description even if the model overshoots.
    if (text.length > max_chars) {
      const sliced = text.slice(0, max_chars);
      const lastSpace = sliced.lastIndexOf(" ");
      text = (lastSpace > max_chars - 30 ? sliced.slice(0, lastSpace) : sliced).replace(/[.,;:\-]+$/, "");
    }

    return new Response(JSON.stringify({ meta_description: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-meta-description error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
