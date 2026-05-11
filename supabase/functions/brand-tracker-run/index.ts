// LLM Brand Tracker — accuracy-tuned edition.
//
// Per user config:
//   - model_tier:      fast | balanced | premium     (controls which models)
//   - runs_per_prompt: 1..10                          (averaging cuts noise)
//   - web_browsing:    bool                           (closer to real-user UX)
//   - use_llm_judge:   bool                           (semantic mention check)
//
// Each prompt is sent to ChatGPT + Claude + Perplexity. For each provider response
// we:
//   1. Substring-match brand + aliases + competitors (cheap baseline)
//   2. (Optional) Call a small judge model that returns JSON {mentioned, sentiment,
//      prominence, context} — catches paraphrased / pronoun / acronym mentions
//      the substring matcher misses, AND removes false positives where the brand
//      name is a common word.
//
// Multiple runs per prompt go in as separate rows with run_index set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || "";

const PROVIDERS = ["chatgpt", "claude", "perplexity"] as const;
type Provider = typeof PROVIDERS[number];
type Tier = "fast" | "balanced" | "premium";

const MODELS: Record<Tier, Record<Provider, string>> = {
  fast: {
    chatgpt: "gpt-4o-mini",
    claude: "claude-haiku-4-5-20251001",
    perplexity: "sonar",
  },
  balanced: {
    chatgpt: "gpt-4o",
    claude: "claude-sonnet-4-6",
    perplexity: "sonar",
  },
  premium: {
    chatgpt: "gpt-4o",
    claude: "claude-opus-4-7",
    perplexity: "sonar-pro",
  },
};

type ProviderResult = {
  provider: Provider;
  model: string;
  response_text: string;
  citations: string[];
  tokens_used: number | null;
  web_browsing_used: boolean;
  error?: string;
};

// ---------- ChatGPT ---------------------------------------------------------

async function runOpenAI(prompt: string, tier: Tier, browsing: boolean): Promise<ProviderResult> {
  if (!OPENAI_API_KEY) return { provider: "chatgpt", model: "", response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: "OPENAI_API_KEY not set" };
  const model = MODELS[tier].chatgpt;
  if (browsing) {
    // Responses API with built-in web_search_preview tool.
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search_preview" }],
        input: prompt,
        temperature: 0.4,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Fall back to plain chat if web_search_preview unsupported on this account.
      return runOpenAIPlain(prompt, model);
    }
    const output = data?.output || [];
    let text = "";
    const citations: string[] = [];
    for (const block of output) {
      if (block?.type === "message") {
        for (const c of block?.content || []) {
          if (c?.type === "output_text") {
            text += c.text || "";
            for (const ann of c.annotations || []) {
              if (ann?.type === "url_citation" && ann.url) citations.push(ann.url);
            }
          }
        }
      }
    }
    return { provider: "chatgpt", model, response_text: text, citations: dedupe([...citations, ...extractUrls(text)]), tokens_used: data?.usage?.total_tokens ?? null, web_browsing_used: true };
  }
  return runOpenAIPlain(prompt, model);
}

async function runOpenAIPlain(prompt: string, model: string): Promise<ProviderResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.4 }),
  });
  const data = await res.json();
  if (!res.ok) return { provider: "chatgpt", model, response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: data?.error?.message || `HTTP ${res.status}` };
  const text: string = data?.choices?.[0]?.message?.content || "";
  return { provider: "chatgpt", model, response_text: text, citations: extractUrls(text), tokens_used: data?.usage?.total_tokens ?? null, web_browsing_used: false };
}

// ---------- Claude ----------------------------------------------------------

async function runClaude(prompt: string, tier: Tier, browsing: boolean): Promise<ProviderResult> {
  if (!ANTHROPIC_API_KEY) return { provider: "claude", model: "", response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: "ANTHROPIC_API_KEY not set" };
  const model = MODELS[tier].claude;
  const body: any = {
    model,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  };
  if (browsing) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (browsing) return runClaude(prompt, tier, false); // fall back without browsing
    return { provider: "claude", model, response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: data?.error?.message || `HTTP ${res.status}` };
  }
  const blocks = data?.content || [];
  let text = "";
  const citations: string[] = [];
  for (const b of blocks) {
    if (b?.type === "text") {
      text += b.text || "";
      for (const cite of b.citations || []) {
        if (cite?.url) citations.push(cite.url);
      }
    } else if (b?.type === "web_search_tool_result") {
      for (const item of b?.content || []) {
        if (item?.url) citations.push(item.url);
      }
    }
  }
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  return { provider: "claude", model, response_text: text, citations: dedupe([...citations, ...extractUrls(text)]), tokens_used: tokens, web_browsing_used: browsing };
}

// ---------- Perplexity ------------------------------------------------------

async function runPerplexity(prompt: string, tier: Tier): Promise<ProviderResult> {
  if (!PERPLEXITY_API_KEY) return { provider: "perplexity", model: "", response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: "PERPLEXITY_API_KEY not set" };
  const model = MODELS[tier].perplexity;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PERPLEXITY_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.4 }),
  });
  const data = await res.json();
  if (!res.ok) return { provider: "perplexity", model, response_text: "", citations: [], tokens_used: null, web_browsing_used: false, error: data?.error?.message || `HTTP ${res.status}` };
  const text: string = data?.choices?.[0]?.message?.content || "";
  const explicit: string[] = Array.isArray(data?.citations) ? data.citations : [];
  return { provider: "perplexity", model, response_text: text, citations: dedupe([...explicit, ...extractUrls(text)]), tokens_used: data?.usage?.total_tokens ?? null, web_browsing_used: true /* sonar always browses */ };
}

// ---------- Helpers ---------------------------------------------------------

function extractUrls(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s)\]"]+/g;
  const found = text.match(re) || [];
  return dedupe(found.map((u) => u.replace(/[.,;:!?]+$/, "")));
}

function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function detectMentions(text: string, terms: string[]): { matched: string[]; firstPosition: number | null } {
  if (!text || terms.length === 0) return { matched: [], firstPosition: null };
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let firstPosition: number | null = null;
  for (const t of terms) {
    const tl = t.toLowerCase().trim();
    if (!tl) continue;
    const idx = lower.indexOf(tl);
    if (idx >= 0) {
      matched.push(t);
      if (firstPosition === null || idx < firstPosition) firstPosition = idx;
    }
  }
  return { matched, firstPosition };
}

// ---------- LLM-as-judge ----------------------------------------------------

type JudgeResult = {
  mentioned: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  prominence: "primary" | "secondary" | "passing" | null;
  context: string;
};

async function llmJudge(brandName: string, aliases: string[], response: string): Promise<JudgeResult | null> {
  if (!ANTHROPIC_API_KEY || !response.trim()) return null;
  const aliasLine = aliases.length ? `Aliases / variants: ${aliases.join(", ")}\n` : "";
  const prompt = `You are evaluating whether an LLM's response mentioned a brand. Be strict: only count direct references to the brand (or clear paraphrases / acronyms / pronouns referring to it). Do NOT count unrelated uses of common words.

Brand: ${brandName}
${aliasLine}
Response (truncated to 4000 chars):
"""
${response.slice(0, 4000)}
"""

Return ONLY a JSON object with this schema, no prose, no markdown fences:
{
  "mentioned": boolean,
  "sentiment": "positive" | "neutral" | "negative" | null,
  "prominence": "primary" | "secondary" | "passing" | null,
  "context": string (max 200 chars describing how it's mentioned, "" if not mentioned)
}

Definitions:
- primary: the brand is a/the main answer or recommendation
- secondary: brand is listed alongside others as a viable option
- passing: brand is mentioned in passing without endorsement
- sentiment: how the brand is portrayed when mentioned; null if not mentioned`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string = (data?.content || []).map((b: any) => b?.text || "").join("").trim();
  // Strip code fences if model wraps anyway.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      mentioned: !!parsed.mentioned,
      sentiment: parsed.sentiment ?? null,
      prominence: parsed.prominence ?? null,
      context: String(parsed.context || "").slice(0, 200),
    };
  } catch { return null; }
}

// ---------- Main handler ----------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let auth;
  try { auth = await requireAuth(req); } catch (r) { return r as Response; }
  const userId = auth.userId;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg } = await supabase
    .from("brand_tracker_config")
    .select("brand_name, brand_aliases, competitors, prompts, model_tier, runs_per_prompt, web_browsing, use_llm_judge")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cfg?.brand_name) return json({ error: "Set up your brand name in Settings → Brand Tracker first." }, 400);

  const tier = (cfg.model_tier as Tier) || "balanced";
  const runsPerPrompt = Math.max(1, Math.min(10, cfg.runs_per_prompt || 3));
  const browsing = cfg.web_browsing !== false;
  const useJudge = cfg.use_llm_judge !== false;

  const brandTerms: string[] = [cfg.brand_name, ...((cfg.brand_aliases as string[]) || [])].filter(Boolean);
  const competitorTerms: string[] = ((cfg.competitors as string[]) || []).filter(Boolean);

  const requestedProviders: Provider[] = Array.isArray(body.providers) && body.providers.length > 0
    ? body.providers.filter((p: string) => PROVIDERS.includes(p as Provider))
    : [...PROVIDERS];

  const prompts: string[] = body.run_all_prompts
    ? ((cfg.prompts as string[]) || [])
    : body.prompt ? [body.prompt] : [];

  if (prompts.length === 0) return json({ error: "No prompt provided and no saved prompts to run." }, 400);

  const runners: Record<Provider, (p: string) => Promise<ProviderResult>> = {
    chatgpt: (p) => runOpenAI(p, tier, browsing),
    claude: (p) => runClaude(p, tier, browsing),
    perplexity: (p) => runPerplexity(p, tier),
  };

  const allInserts: any[] = [];

  for (const prompt of prompts) {
    for (let runIndex = 0; runIndex < runsPerPrompt; runIndex++) {
      const providerResults = await Promise.all(requestedProviders.map((p) => runners[p](prompt)));
      // Judge in parallel after we have all provider responses.
      const judgeResults = useJudge
        ? await Promise.all(providerResults.map((r) => r.response_text ? llmJudge(cfg.brand_name!, (cfg.brand_aliases as string[]) || [], r.response_text) : null))
        : providerResults.map(() => null);

      for (let i = 0; i < providerResults.length; i++) {
        const r = providerResults[i];
        const judge = judgeResults[i];
        const brandHit = detectMentions(r.response_text, brandTerms);
        const compHit = detectMentions(r.response_text, competitorTerms);
        // "mentions_brand" = judge agrees OR substring matched (judge can override false positives if user wants strict).
        // We keep substring + judge fields separate for transparency.
        const mentions_brand = judge ? judge.mentioned : brandHit.matched.length > 0;
        allInserts.push({
          user_id: userId,
          prompt,
          provider: r.provider,
          model: r.model,
          model_tier: tier,
          response_text: r.response_text,
          mentions_brand,
          brand_position: brandHit.firstPosition,
          mentions_competitors: compHit.matched,
          citations: r.citations,
          tokens_used: r.tokens_used,
          web_browsing_used: r.web_browsing_used,
          run_index: runIndex,
          llm_judge_mentioned: judge?.mentioned ?? null,
          llm_judge_sentiment: judge?.sentiment ?? null,
          llm_judge_prominence: judge?.prominence ?? null,
          llm_judge_context: judge?.context ?? null,
          error: r.error || null,
        });
      }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("brand_tracker_runs")
    .insert(allInserts)
    .select("id, provider, mentions_brand, llm_judge_mentioned, llm_judge_sentiment");

  if (insErr) return json({ error: insErr.message }, 500);

  const validRows = inserted?.filter((r: any) => r) || [];
  const hits = validRows.filter((r: any) => r.mentions_brand).length;
  return json({
    success: true,
    runs: inserted?.length || 0,
    summary: {
      prompts: prompts.length,
      providers: requestedProviders,
      runs_per_prompt: runsPerPrompt,
      tier,
      web_browsing: browsing,
      llm_judge: useJudge,
      brand_hit_rate: validRows.length ? hits / validRows.length : 0,
    },
  });
});
