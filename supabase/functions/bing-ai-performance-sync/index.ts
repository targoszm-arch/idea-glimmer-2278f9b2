// Pulls AI Performance data from Bing Webmaster Tools and persists it to
// bing_ai_citations so the Brand Tracker page can show how the site is
// surfacing in Copilot / Bing Chat / Search-with-AI alongside the
// ChatGPT/Claude/Perplexity data we already track.
//
// Required ContentLab Supabase secret:
//   BING_WEBMASTER_API_KEY  — generated in Bing Webmaster Tools →
//                             Settings → API Access.
//
// Body:
//   { siteUrl: "https://www.skillstudio.ai/" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BING_KEY = Deno.env.get("BING_WEBMASTER_API_KEY") || "";
// Bing Webmaster's JSON API root.
const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

type BingRow = {
  Query?: string;
  Url?: string;
  Impressions?: number;
  Clicks?: number;
  Position?: number;
  Date?: string;
  StartDate?: string;
  EndDate?: string;
  AISource?: string;
  Source?: string;
};

// Bing Webmaster v2 wraps real data in either { d: {...} } (OData) or just
// { Errors: [], Result: [...] }. Normalise both shapes.
function extractRows(payload: any): BingRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.d)) return payload.d;
  if (Array.isArray(payload?.Result)) return payload.Result;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
}

async function callBing(path: string, siteUrl: string): Promise<{ ok: boolean; rows: BingRow[]; error?: string; url: string }> {
  const u = new URL(`${BING_BASE}/${path}`);
  u.searchParams.set("apikey", BING_KEY);
  u.searchParams.set("siteUrl", siteUrl);
  try {
    const res = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
    const text = await res.text();
    if (!res.ok) return { ok: false, rows: [], error: `HTTP ${res.status}: ${text.slice(0, 300)}`, url: u.toString().replace(BING_KEY, "***") };
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { ok: false, rows: [], error: `Non-JSON: ${text.slice(0, 200)}`, url: u.toString().replace(BING_KEY, "***") }; }
    return { ok: true, rows: extractRows(parsed), url: u.toString().replace(BING_KEY, "***") };
  } catch (e: any) {
    return { ok: false, rows: [], error: e.message, url: u.toString().replace(BING_KEY, "***") };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let auth;
  try { auth = await requireAuth(req); } catch (r) { return r as Response; }
  const userId = auth.userId;

  if (!BING_KEY) {
    return json({
      error: "BING_WEBMASTER_API_KEY is not set in ContentLab Supabase function secrets.",
      detail: "Add it at https://supabase.com/dashboard/project/rnshobvpqegttrpaowxe/settings/functions",
    }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const siteUrl = String(body?.siteUrl || "").trim();
  if (!siteUrl) return json({ error: "`siteUrl` is required, e.g. https://www.skillstudio.ai/" }, 400);

  // Bing exposes several relevant endpoints. The exact endpoint name for AI
  // Performance varies by API generation — try the most likely names and
  // collect whichever returns data, then merge.
  const candidates = [
    "GetAIPerformance",
    "GetAIPageStats",
    "GetCopilotStats",
    "GetChatPerformance",
    "GetGenerativeAISearchPerformance",
    // Legacy fallbacks (not strictly AI but useful baseline if AI endpoint is gated):
    "GetSearchPerformanceReportForPageQuery",
    "GetSearchPerformanceReport",
  ];

  const attempts: Array<{ endpoint: string; ok: boolean; rows: number; error?: string; sample_url?: string }> = [];
  const aggregated: BingRow[] = [];
  let foundEndpoint: string | null = null;

  for (const endpoint of candidates) {
    const result = await callBing(endpoint, siteUrl);
    attempts.push({ endpoint, ok: result.ok, rows: result.rows.length, error: result.error, sample_url: result.url });
    if (result.ok && result.rows.length > 0) {
      foundEndpoint = endpoint;
      for (const r of result.rows) aggregated.push({ ...r, Source: r.Source || endpoint });
      break; // First endpoint that returns data wins.
    }
  }

  if (!foundEndpoint || aggregated.length === 0) {
    return json({
      success: false,
      error: "Bing returned no AI performance data on any tried endpoint",
      tried_endpoints: attempts,
      hint: "Possible causes: site not yet indexed by Bing's AI surfaces, key lacks AI scope, or endpoint name has changed. Paste me the exact API URL Bing's docs show for AI Performance and I'll wire it directly.",
    }, 200);
  }

  // Persist. Wipe today's snapshot first to make the function idempotent.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("bing_ai_citations")
    .delete()
    .eq("user_id", userId)
    .eq("site_url", siteUrl)
    .gte("fetched_at", today + "T00:00:00Z");

  const rows = aggregated.map((r) => ({
    user_id: userId,
    site_url: siteUrl,
    query: r.Query ?? null,
    page_url: r.Url ?? null,
    impressions: typeof r.Impressions === "number" ? r.Impressions : 0,
    clicks: typeof r.Clicks === "number" ? r.Clicks : 0,
    position: typeof r.Position === "number" ? r.Position : null,
    period_start: r.StartDate || r.Date || null,
    period_end: r.EndDate || r.Date || null,
    ai_source: r.AISource || r.Source || foundEndpoint,
  }));

  const { error: insErr } = await supabase.from("bing_ai_citations").insert(rows);
  if (insErr) return json({ error: insErr.message }, 500);

  return json({
    success: true,
    rows: rows.length,
    endpoint: foundEndpoint,
    site_url: siteUrl,
  });
});
