import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // POST — write back the live URLs Framer itself publishes each item at.
  // This is the single source of truth for article links: the RSS feed reads
  // framer_live_url directly, never constructs a URL from slug. If the plugin
  // hasn't reported a URL for an article, it is ineligible for RSS — enforced
  // by a DB trigger.
  //
  // Body: {
  //   live_url_updates: [{ id: string, framer_live_url: string }]
  //   // legacy: url_path_updates: [{ id, framer_slug }]  ← still accepted, derives url_path only
  // }
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
      const liveUrlUpdates: Array<{ id: string; framer_live_url: string }> =
        body.live_url_updates ?? [];
      const updates: Array<{ id: string; framer_slug: string }> = body.url_path_updates ?? [];

      // Persist Framer's published URLs first — this is what RSS reads.
      let liveUrlUpdated = 0;
      for (const { id, framer_live_url } of liveUrlUpdates) {
        if (!id || !framer_live_url) continue;
        // Light validation: must be an absolute https URL.
        if (!/^https:\/\/[^/]+\/.+/.test(framer_live_url)) continue;
        const { error } = await adminSupabase
          .from("articles")
          .update({ framer_live_url })
          .eq("id", id)
          .eq("user_id", userId);
        if (!error) liveUrlUpdated++;
      }

      if (!updates.length) {
        return new Response(
          JSON.stringify({ ok: true, updated: 0, live_urls_updated: liveUrlUpdated }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build url_path from each article's own category + slug fields.
      // URL format: {category-slug}/{article-slug}
      // e.g. "features-updates/ai-literacy-future-workforce-essential"
      //      "course-authoring/3-ways-to-elevate-online-courses"
      // We look up the article directly instead of trusting the Framer-assigned
      // slug (which was causing doubled category prefixes like
      // "features-updates/features-updates-ai-literacy-...").
      function toUrlSlug(s: string): string {
        return s.toLowerCase().normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }

      let updatedCount = 0;
      for (const { id } of updates) {
        if (!id) continue;
        const { data: article } = await adminSupabase
          .from("articles")
          .select("slug, category, content_type")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        if (!article?.slug) continue;

        let url_path: string;
        if (article.content_type === "user_guide" || article.content_type === "how_to") {
          url_path = `help/knowledge-base/${article.slug}/documentation-articles`;
        } else {
          const catSlug = article.category ? toUrlSlug(article.category) : "features-updates";
          url_path = `${catSlug}/${article.slug}`;
        }

        const { error } = await adminSupabase
          .from("articles")
          .update({ url_path })
          .eq("id", id)
          .eq("user_id", userId);
        if (!error) updatedCount++;
      }

      return new Response(
        JSON.stringify({ ok: true, updated: updatedCount, live_urls_updated: liveUrlUpdated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

  const PLAN_MAX_COLLECTIONS: Record<string, number> = { free: 0, starter: 1, pro: 5, admin: Number.POSITIVE_INFINITY };

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
      : "id, title, slug, url_path, content_type, display_type, content, excerpt, meta_description, category, cover_image_url, created_at, updated_at, reading_time_minutes, author_name, article_meta, related_article_ids";

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

      // Strip <img> tags whose src isn't on a host Framer can reliably fetch.
      // Framer re-uploads every <img src> to its own CDN; if the source host
      // blocks the fetch (CORS / auth), Framer aborts the entire addItems call.
      // Allow Supabase storage (where user-uploaded body images live) and
      // Framer's own CDN; strip everything else (e.g. storage.saltfish.ai).
      content = content.replace(/<img[^>]*\bsrc=["']([^"']*)["'][^>]*\/?>/gi, (match, src) => {
        const allowed =
          /\.supabase\.co\/storage\//.test(src) ||
          /(^|\/\/)([^/]*\.)?framerusercontent\.com\//.test(src) ||
          /(^|\/\/)([^/]*\.)?framer\.com\//.test(src);
        return allowed ? match : "";
      });
      // Also drop any remaining img tags without a src
      content = content.replace(/<img(?![^>]*\bsrc=)[^>]*\/?>/gi, "");

      // Extract every body <img> into separate CMS fields so the Framer
      // template can render each as a real Image component with template-
      // controlled sizing. Framer's RichText field strips inline width/
      // style attributes, so leaving images inline left them rendering at
      // their natural pixel size (often tiny). Separate fields solve this.
      //
      // We support up to 8 inline body images per article. Any image
      // beyond that stays in the body so we don't silently drop content.
      const MAX_BODY_IMAGES = 8;
      const bodyImages: Array<{ url: string; alt: string }> = [];
      const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
      let extracted = 0;
      content = content.replace(imgRe, (match, src) => {
        if (extracted >= MAX_BODY_IMAGES) return match; // leave overflow in body
        const altMatch = match.match(/\balt=["']([^"']*)["']/i);
        bodyImages.push({ url: src, alt: altMatch ? altMatch[1] : "" });
        extracted++;
        // Use an inline <span> placeholder so we don't break HTML validity
        // when the image was positioned mid-paragraph (TipTap normally
        // blocks images but some editors / pastes leave them inline).
        // The template can use these markers to render the image slot in
        // place, or simply ignore them and stack body images at the end.
        return `<span data-body-image-slot="${extracted}">[Image ${extracted}]</span>`;
      });

      // Build flat per-slot fields (body_image_1..8 + body_image_1_alt..8)
      // so the Framer plugin can map each to a dedicated image field.
      const bodyImageFields: Record<string, string> = {};
      for (let i = 0; i < MAX_BODY_IMAGES; i++) {
        bodyImageFields[`body_image_${i + 1}`] = bodyImages[i]?.url ?? "";
        bodyImageFields[`body_image_${i + 1}_alt`] = bodyImages[i]?.alt ?? "";
      }

      return {
        ...a,
        content,
        video_url,
        keywords,
        facts,
        references,
        ...bodyImageFields,
        body_image_count: bodyImages.length,
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
