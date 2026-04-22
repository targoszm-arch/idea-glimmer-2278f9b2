import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // POST — write back actual Framer slugs so url_path stays in sync.
  // Body: { url_path_updates: [{id: string, framer_slug: string}] }
  // Framer auto-prepends the Category field slug to each item slug, so the
  // actual slug isn't known until after addItems. The plugin calls this right
  // after every sync to correct url_path for all affected articles.
  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const xApiKey = req.headers.get("x-api-key") ?? "";
    const token = authHeader.replace("Bearer ", "").trim() || xApiKey.trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    if (token.startsWith("cl_")) {
      const { data: keyData } = await adminSupabase
        .from("api_keys").select("user_id").eq("key", token).single();
      if (!keyData) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = keyData.user_id;
    } else {
      const anonSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonSupabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    try {
      const body = await req.json();
      const updates: Array<{ id: string; framer_slug: string }> = body.url_path_updates ?? [];
      if (!updates.length) {
        return new Response(JSON.stringify({ ok: true, updated: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve the CMS detail-page path from the user's integration metadata.
      // Falls back to "features-updates" which is the default for skillstudio.ai.
      const { data: integration } = await adminSupabase
        .from("user_integrations")
        .select("metadata")
        .eq("user_id", userId)
        .eq("platform", "framer")
        .maybeSingle();
      const collectionPage: string =
        (integration?.metadata as any)?.collection_page ?? "features-updates";

      let updatedCount = 0;
      for (const { id, framer_slug } of updates) {
        if (!id || !framer_slug) continue;
        const url_path = `${collectionPage}/${framer_slug}`;
        const { error } = await adminSupabase
          .from("articles")
          .update({ url_path })
          .eq("id", id)
          .eq("user_id", userId);
        if (!error) updatedCount++;
      }

      return new Response(JSON.stringify({ ok: true, updated: updatedCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const xApiKey = req.headers.get("x-api-key") ?? "";
  const token = (authHeader.replace("Bearer ", "").trim()) || xApiKey.trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string | null = null;

  if (token.startsWith("cl_")) {
    const { data: keyData } = await adminSupabase
      .from("api_keys")
      .select("user_id")
      .eq("key", token)
      .single();

    if (!keyData) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    userId = keyData.user_id;
    await adminSupabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", token);
  } else {
    const anonSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonSupabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
  }

  // ── Collection-slot enforcement ──────────────────────────────────────────
  const collectionId = req.headers.get("x-framer-collection-id") ?? null;

  // Admin emails bypass all collection limits (comma-separated in env var)
  const adminEmails = new Set(
    (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
  );
  const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId!);
  const isAdmin = adminEmails.has((authUser?.user?.email ?? "").toLowerCase());

  const PLAN_MAX_COLLECTIONS: Record<string, number> = { free: 0, starter: 1, pro: 5 };

  const { data: credits } = await adminSupabase
    .from("user_credits")
    .select("plan, stripe_payment_status")
    .eq("user_id", userId)
    .single();

  const plan = credits?.plan ?? "free";
  const isActive =
    credits?.stripe_payment_status === "active" ||
    (plan !== "free" && credits?.stripe_payment_status !== "cancelled");
  const maxCollections = isAdmin ? Infinity : (isActive ? (PLAN_MAX_COLLECTIONS[plan] ?? 1) : 0);

  if (maxCollections === 0) {
    return new Response(
      JSON.stringify({ error: "Active subscription required to sync collections." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (collectionId) {
    const { data: existing } = await adminSupabase
      .from("user_integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", "framer")
      .eq("collection_id", collectionId)
      .maybeSingle();

    if (!existing) {
      const { count } = await adminSupabase
        .from("user_integrations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("platform", "framer")
        .not("collection_id", "is", null);

      if ((count ?? 0) >= maxCollections) {
        return new Response(
          JSON.stringify({
            error: `Your plan allows ${maxCollections} collection(s). Upgrade to sync more.`,
            max_collections: maxCollections,
            upgrade_required: true,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminSupabase.from("user_integrations").insert({
        user_id: userId,
        platform: "framer",
        collection_id: collectionId,
        access_token: "plugin-managed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category");
    const countOnly = url.searchParams.get("count_only") === "1";

    // For count/category checks, skip heavy content fields
    const selectFields = countOnly
      ? "id, category"
      : "id, title, slug, url_path, content_type, content, excerpt, meta_description, category, cover_image_url, created_at, updated_at, reading_time_minutes, author_name, article_meta, related_article_ids";

    let query = adminSupabase
      .from("articles")
      .select(selectFields)
      .eq("status", "published")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (categoryFilter && categoryFilter !== "all") {
      query = query.ilike("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Extract categories from the same query — no second DB round trip
    const categories = [...new Set(
      (data ?? []).map((r: any) => r.category).filter(Boolean)
    )].sort();

    if (countOnly) {
      return new Response(
        JSON.stringify({ ok: true, count: (data ?? []).length, categories }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flatten article_meta fields into top-level for Framer
    const articles = (data ?? []).map((a: any) => {
      const meta = a.article_meta || {};

      // keywords: array of strings -> comma-separated
      const keywords = Array.isArray(meta.keywords)
        ? meta.keywords.join(", ")
        : (meta.keywords ?? "");

      // facts: array of strings -> bullet list
      const facts = Array.isArray(meta.facts)
        ? meta.facts.map((f: string) => `• ${f}`).join("\n")
        : (meta.facts ?? "");

      // sources/references: array of {url, title} -> newline-separated URLs
      const references = Array.isArray(meta.sources)
        ? meta.sources.map((s: any) => s.url || "").filter(Boolean).join("\n")
        : (meta.references ?? "");

      // Extract video URL before stripping — exposed as a dedicated Framer field
      const rawContent: string = a.content ?? "";
      const videoMatch = rawContent.match(/<video[^>]*\bsrc="([^"]*)"/i);
      const video_url: string = videoMatch?.[1] ?? "";

      // Strip video from body — served via the dedicated Video URL field only
      let content = rawContent.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, "");
      content = content.replace(/<video[^>]*\/?>/gi, "");

      return {
        ...a,
        content,
        video_url,
        keywords,
        facts,
        references,
      };
    });

    return new Response(
      JSON.stringify({ ok: true, count: articles.length, articles, categories }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
