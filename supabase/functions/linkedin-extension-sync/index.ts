// Browser extension → ContentLab sync endpoint.
// Authenticates via a personal API token (Bearer <token>) issued in Settings.
// Accepts profile + company snapshots and upserts them per-user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Missing token" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tokenHash = await sha256(token);
  const { data: tok, error: tokErr } = await supabase
    .from("linkedin_extension_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (tokErr || !tok || tok.revoked_at) return json({ error: "Invalid token" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const userId = tok.user_id as string;
  const rows: any[] = [];

  if (body?.profile) {
    rows.push({
      user_id: userId,
      kind: "profile",
      company_id: null,
      data: body.profile,
      fetched_at: new Date().toISOString(),
    });
  }
  if (Array.isArray(body?.companies)) {
    for (const c of body.companies) {
      if (!c?.id) continue;
      rows.push({
        user_id: userId,
        kind: "company",
        company_id: String(c.id),
        data: c,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) return json({ error: "No profile or companies in payload" }, 400);

  // Mimic upsert on (user_id, kind, coalesce(company_id,'')) — delete + insert.
  for (const r of rows) {
    await supabase
      .from("linkedin_snapshots")
      .delete()
      .eq("user_id", r.user_id)
      .eq("kind", r.kind)
      .eq("company_id", r.company_id ?? "");
    // For null company_id rows the eq above won't match on null in PostgREST.
    if (r.company_id === null) {
      await supabase
        .from("linkedin_snapshots")
        .delete()
        .eq("user_id", r.user_id)
        .eq("kind", r.kind)
        .is("company_id", null);
    }
  }
  const { error: insErr } = await supabase.from("linkedin_snapshots").insert(rows);
  if (insErr) return json({ error: insErr.message }, 500);

  await supabase
    .from("linkedin_extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tok.id);

  return json({ success: true, written: rows.length });
});
