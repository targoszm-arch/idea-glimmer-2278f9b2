import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function sanitizeHtmlForIntercom(html: string): string {
  return html.replace(/<img[^>]+src="[^"]*\.webp"[^>]*\/?>/gi, '');
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const INTERCOM_API_TOKEN = Deno.env.get("INTERCOM_API_TOKEN");
    if (!INTERCOM_API_TOKEN) throw new Error("INTERCOM_API_TOKEN is not configured");

    const body = await req.json();

    // Mode 1: List collections
    if (body.list_collections) {
      const collectionsRes = await fetch("https://api.intercom.io/help_center/collections", {
        headers: {
          Authorization: `Bearer ${INTERCOM_API_TOKEN}`,
          "Intercom-Version": "2.11",
        },
      });
      const collectionsData = await collectionsRes.json();
      if (!collectionsRes.ok) {
        throw new Error("Failed to fetch Intercom collections: " + JSON.stringify(collectionsData));
      }
      return new Response(JSON.stringify({
        collections: (collectionsData.data || []).map((c: any) => ({ id: c.id, name: c.name })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: Sync article
    // Fetch the first admin's ID from Intercom automatically
    const adminsRes = await fetch("https://api.intercom.io/admins", {
      headers: {
        Authorization: `Bearer ${INTERCOM_API_TOKEN}`,
        "Intercom-Version": "2.11",
      },
    });
    const adminsData = await adminsRes.json();
    if (!adminsRes.ok || !adminsData.admins?.length) {
      throw new Error("Failed to fetch Intercom admins: " + JSON.stringify(adminsData));
    }
    const authorId = parseInt(adminsData.admins[0].id);

    const { article_id, parent_id } = body;
    if (!article_id) {
      return new Response(JSON.stringify({ error: "article_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: article, error: fetchError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", article_id)
      .single();

    if (fetchError || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const intercomPayload: Record<string, unknown> = {
      title: article.title,
      description: article.excerpt || "",
      body: sanitizeHtmlForIntercom(article.content || ""),
      state: article.status === "published" ? "published" : "draft",
      author_id: authorId,
    };

    const existingIntercomId = article.intercom_article_id;

    // Only include parent_id on create (Intercom doesn't support moving via update)
    if (!existingIntercomId && parent_id) {
      intercomPayload.parent_id = parent_id;
      intercomPayload.parent_type = "collection";
    }

    let intercomResponse: Response;

    if (existingIntercomId) {
      intercomResponse = await fetch(`https://api.intercom.io/articles/${existingIntercomId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERCOM_API_TOKEN}`,
          "Intercom-Version": "2.11",
        },
        body: JSON.stringify(intercomPayload),
      });
    } else {
      intercomResponse = await fetch("https://api.intercom.io/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERCOM_API_TOKEN}`,
          "Intercom-Version": "2.11",
        },
        body: JSON.stringify(intercomPayload),
      });
    }

    const intercomData = await intercomResponse.json();

    if (!intercomResponse.ok) {
      console.error("Intercom API error:", intercomData);
      return new Response(JSON.stringify({ error: intercomData.errors?.[0]?.message || "Intercom sync failed" }), {
        status: intercomResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store the Intercom article ID for future updates
    if (!existingIntercomId && intercomData.id) {
      await supabase
        .from("articles")
        .update({ intercom_article_id: String(intercomData.id) })
        .eq("id", article_id);
    }

    return new Response(JSON.stringify({
      success: true,
      intercom_article_id: intercomData.id,
      action: existingIntercomId ? "updated" : "created",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-to-intercom error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
