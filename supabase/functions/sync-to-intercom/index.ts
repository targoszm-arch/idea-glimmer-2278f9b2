import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function sanitizeHtmlForIntercom(html: string): string {
  return html.replace(/<img[^>]+src="[^"]*\.webp"[^>]*\/?>/gi, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Get user's Intercom token from integrations table ───────────────────
    const { data: integration } = await supabase
      .from("user_integrations")
      .select("access_token, metadata")
      .eq("user_id", user.id)
      .eq("platform", "intercom")
      .single();

    if (!integration) {
      return new Response(JSON.stringify({
        error: "Intercom not connected. Please connect Intercom in Settings → Integrations.",
        code: "NOT_CONNECTED",
      }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const intercomHeaders = {
      Authorization: `Bearer ${integration.access_token}`,
      "Content-Type": "application/json",
      "Intercom-Version": "2.11",
    };

    const body = await req.json();

    // ── Mode: list_collections ──────────────────────────────────────────────
    if (body.list_collections) {
      const res = await fetch("https://api.intercom.io/help_center/collections", { headers: intercomHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to fetch Intercom collections: " + JSON.stringify(data));
      return new Response(JSON.stringify({
        collections: (data.data || []).map((c: any) => ({ id: c.id, name: c.name })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode: sync article ──────────────────────────────────────────────────
    const { article_id, parent_id } = body;
    if (!article_id) {
      return new Response(JSON.stringify({ error: "article_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: article } = await supabase.from("articles").select("*").eq("id", article_id).single();
    if (!article) {
      return new Response(JSON.stringify({ error: "Article not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get admin ID automatically
    const adminsRes = await fetch("https://api.intercom.io/admins", { headers: intercomHeaders });
    const adminsData = await adminsRes.json();
    if (!adminsRes.ok || !adminsData.admins?.length) throw new Error("Failed to fetch Intercom admins");
    const authorId = parseInt(adminsData.admins[0].id);

    const payload: Record<string, unknown> = {
      title: article.title,
      description: article.excerpt || "",
      body: sanitizeHtmlForIntercom(article.content || ""),
      state: article.status === "published" ? "published" : "draft",
      author_id: authorId,
    };

    const existingId = article.intercom_article_id;
    if (!existingId && parent_id) {
      payload.parent_id = parent_id;
      payload.parent_type = "collection";
    }

    let intercomRes: Response;
    if (existingId) {
      intercomRes = await fetch(`https://api.intercom.io/articles/${existingId}`, {
        method: "PUT", headers: intercomHeaders, body: JSON.stringify(payload),
      });
    } else {
      intercomRes = await fetch("https://api.intercom.io/articles", {
        method: "POST", headers: intercomHeaders, body: JSON.stringify(payload),
      });
    }

    const intercomData = await intercomRes.json();
    if (!intercomRes.ok) {
      return new Response(JSON.stringify({ error: intercomData.errors?.[0]?.message || "Intercom sync failed" }), {
        status: intercomRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!existingId && intercomData.id) {
      await supabase.from("articles").update({ intercom_article_id: String(intercomData.id) }).eq("id", article_id);
    }

    return new Response(JSON.stringify({
      success: true,
      intercom_article_id: intercomData.id,
      action: existingId ? "updated" : "created",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("sync-to-intercom error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
