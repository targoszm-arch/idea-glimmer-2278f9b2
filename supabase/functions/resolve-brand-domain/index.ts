// Given a brand or company name, return its real primary domain(s).
//
// Approach (best-first):
//   1. Ask Claude haiku (with the web_search tool) to return the official site
//      for "{name}" as bare hostnames. Cheap, accurate, handles obscure names.
//   2. Validate each candidate with a HEAD/GET request — drop dead domains
//      and parked pages.
//
// Auth: standard Supabase JWT.

import { requireAuth } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

function extractHostnames(text: string): string[] {
  // Match bare hostnames (domain.tld) or full URLs; strip protocol/path.
  const re = /(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/[^\s,;]*)?/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let host = m[1].toLowerCase().replace(/^www\./, "");
    // Drop obvious non-domains
    if (host.length < 4) continue;
    if (!host.includes(".")) continue;
    out.add(host);
  }
  return Array.from(out);
}

async function validateDomain(host: string): Promise<boolean> {
  try {
    // Use GET (not HEAD — some sites 405 HEAD) with a short timeout.
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(`https://${host}/`, { method: "GET", redirect: "follow", signal: ctl.signal });
    clearTimeout(to);
    return res.ok || res.status < 500;
  } catch { return false; }
}

async function askClaudeForDomain(name: string): Promise<string[]> {
  if (!ANTHROPIC_API_KEY) return [];
  const prompt = `What is the primary official website for the company "${name}"? Use web search to verify. If they have multiple official domains (e.g. .com + a regional TLD), list up to 3.

Reply with ONLY the bare hostnames, one per line, no protocol, no path, no commentary. Example output format:
example.com
example.io

If you cannot find a legitimate company by that name, reply with exactly: NOT_FOUND`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const text = (data?.content || []).map((b: any) => b?.text || "").join("\n");
  if (/NOT_FOUND/.test(text)) return [];
  return extractHostnames(text).slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try { await requireAuth(req); } catch (r) { return r as Response; }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const name = String(body?.name || "").trim();
  if (!name) return json({ error: "Missing name" }, 400);

  const candidates = await askClaudeForDomain(name);
  // Validate in parallel; keep the ones that respond.
  const validation = await Promise.all(candidates.map((h) => validateDomain(h).then((ok) => ({ host: h, ok }))));
  const verified = validation.filter((v) => v.ok).map((v) => v.host);
  // If validation killed everything (e.g. firewall blocks our edge), still return the candidates
  // so the user can manually approve. Mark them unverified.
  const final = verified.length > 0 ? verified : candidates;

  return json({
    name,
    domains: final,
    verified: verified.length > 0,
    note: verified.length === 0 && candidates.length > 0 ? "Could not verify the domain(s) from the edge runtime — please double-check before saving." : undefined,
  });
});
