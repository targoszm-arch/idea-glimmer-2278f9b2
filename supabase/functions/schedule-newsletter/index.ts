// Newsletter scheduling endpoint.
//
// Mirrors the deployed v7 function. Inserts a one-time `scheduled` row
// in `newsletter_schedules`. The cron worker (process-newsletter-queue)
// picks up due rows every 5 minutes and sends via Resend. There is NO
// recurrence — `scheduled_at` is a single timestamp.
//
// Actions (POST body):
//   action=create     - insert a new schedule row
//   action=cancel     - mark scheduled row as cancelled
//   action=delete     - hard delete row from history
//   action=reschedule - move scheduled row's send time
//
// Auth: forwards caller's JWT to Supabase RLS.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "create";

  // GET — list all schedules
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("newsletter_schedules")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ schedules: data }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "POST") {
    const body = await req.json();

    // CREATE
    if (action === "create") {
      const { article_id, subject_line, preview_text, html_content, from_name, from_email, reply_to, audience_type, resend_audience_id, scheduled_at } = body;
      if (!subject_line || !html_content || !from_email || !scheduled_at) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      let recipient_count = body.recipient_count || 0;
      if (!recipient_count && audience_type === "contacts") {
        const { count } = await supabase.from("newsletter_contacts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
        recipient_count = count || 0;
      }
      const { data, error } = await supabase.from("newsletter_schedules").insert({
        user_id: user.id, article_id, subject_line, preview_text, html_content,
        from_name: from_name || "ContentLab", from_email, reply_to,
        audience_type: audience_type || "contacts", resend_audience_id,
        scheduled_at, status: "scheduled", recipient_count
      }).select().single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, schedule: data }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // CANCEL — marks as cancelled (keeps in history)
    if (action === "cancel") {
      const { id } = body;
      const { error } = await supabase.from("newsletter_schedules")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).eq("status", "scheduled");
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // DELETE — hard delete from history
    if (action === "delete") {
      const { id } = body;
      const { error } = await supabase.from("newsletter_schedules")
        .delete()
        .eq("id", id).eq("user_id", user.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // RESCHEDULE — update scheduled_at for a scheduled item
    if (action === "reschedule") {
      const { id, scheduled_at } = body;
      if (!id || !scheduled_at) {
        return new Response(JSON.stringify({ error: "Missing id or scheduled_at" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("newsletter_schedules")
        .update({ scheduled_at, updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).eq("status", "scheduled");
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
});
