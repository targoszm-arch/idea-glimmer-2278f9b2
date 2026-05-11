// LLM Brand Tracker — runs a prompt against ChatGPT / Claude / Perplexity in
// parallel, detects whether the user's brand + competitors were mentioned,
// extracts cited URLs, persists each provider's response.
//
// Auth: standard Supabase JWT (via web app).
// Modes:
//   POST { prompt, providers?, run_id? }     — run one prompt across providers
//   POST { run_all_prompts: true, providers? } — fan out over the user's saved prompts

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

type ProviderResult = {
  provider: Provider;
  model: string;
  response_text: string;
  citations: string[];
  tokens_used: number | null;
  error?: string;
};

async function runOpenAI(prompt: string): Promise<ProviderResult> {
  if (!OPENAI_API_KEY) return { provider: "chatgpt", model: "", response_text: "", citations: [], tokens_used: null, error: "OPENAI_API_KEY not set" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { provider: "chatgpt", model: "gpt-4o-mini", response_text: "", citations: [], tokens_used: null, error: data?.error?.message || `HTTP ${res.status}` };
  const text: string = data?.choices?.[0]?.message?.content || "";
  return { provider: "chatgpt", model: "gpt-4o-mini", response_text: text, citations: extractUrls(text), tokens_used: data?.usage?.total_tokens ?? null };
}

async function runClaude(prompt: string): Promise<ProviderResult> {
  if (!ANTHROPIC_API_KEY) return { provider: "claude", model: "", response_text: "", citations: [], tokens_used: null, error: "ANTHROPIC_API_KEY not set" };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) return { provider: "claude", model: "claude-haiku-4-5", response_text: "", citations: [], tokens_used: null, error: data?.error?.message || `HTTP ${res.status}` };
  const text: string = (data?.content || []).map((b: any) => b?.text || "").join("\n");
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  return { provider: "claude", model: "claude-haiku-4-5", response_text: text, citations: extractUrls(text), tokens_used: tokens };
}

async function runPerplexity(prompt: string): Promise<ProviderResult> {
  if (!PERPLEXITY_API_KEY) return { provider: "perplexity", model: "", response_text: "", citations: [], tokens_used: null, error: "PERPLEXITY_API_KEY not set" };
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { provider: "perplexity", model: "sonar", response_text: "", citations: [], tokens_used: null, error: data?.error?.message || `HTTP ${res.status}` };
  const text: string = data?.choices?.[0]?.message?.content || "";
  // Perplexity returns explicit citations in addition to inline URLs.
  const explicit: string[] = Array.isArray(data?.citations) ? data.citations : [];
  const citations = Array.from(new Set([...explicit, ...extractUrls(text)]));
  return { provider: "perplexity", model: "sonar", response_text: text, citations, tokens_used: data?.usage?.total_tokens ?? null };
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s)\]"]+/g;
  const found = text.match(re) || [];
  return Array.from(new Set(found.map((u) => u.replace(/[.,;:!?]+$/, ""))));
}

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
    .select("brand_name, brand_aliases, competitors, prompts")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cfg?.brand_name) return json({ error: "Set up your brand name in Settings → Brand Tracker first." }, 400);

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
    chatgpt: runOpenAI,
    claude: runClaude,
    perplexity: runPerplexity,
  };

  const allInserts: any[] = [];
  for (const prompt of prompts) {
    const results = await Promise.all(requestedProviders.map((p) => runners[p](prompt)));
    for (const r of results) {
      const brandHit = detectMentions(r.response_text, brandTerms);
      const compHit = detectMentions(r.response_text, competitorTerms);
      allInserts.push({
        user_id: userId,
        prompt,
        provider: r.provider,
        model: r.model,
        response_text: r.response_text,
        mentions_brand: brandHit.matched.length > 0,
        brand_position: brandHit.firstPosition,
        mentions_competitors: compHit.matched,
        citations: r.citations,
        tokens_used: r.tokens_used,
        error: r.error || null,
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("brand_tracker_runs")
    .insert(allInserts)
    .select("id, provider, prompt, mentions_brand, mentions_competitors, citations");

  if (insErr) return json({ error: insErr.message }, 500);

  return json({
    success: true,
    runs: inserted?.length || 0,
    summary: {
      prompts: prompts.length,
      providers: requestedProviders,
      brand_hit_rate: (inserted?.filter((r: any) => r.mentions_brand).length || 0) / Math.max(1, inserted?.length || 0),
    },
  });
});
