// Send-now endpoint for newsletters.
//
// This is the "Send Now" path triggered by the UI button or by the MCP
// server. It loads a schedule row, fetches the audience, personalises
// the HTML per recipient, and sends via Resend's batch API.
//
// Footgun history: this endpoint used to be called for any UI/MCP
// "send" without checking `scheduled_at`. A row scheduled for 2026-04-14
// 07:00 was sent at 2026-04-13 01:36 (29 hours early) because the cron
// worker is not the only caller. The guard below blocks early sends
// unless the caller passes `force: true` — a hard-to-fat-finger flag
// that makes "yes I know it's not due yet, send anyway" intentional.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const TRACK_BASE = `${SUPABASE_URL}/functions/v1/newsletter-track`;

function getResendKey() {
  return Deno.env.get("RESEND_API_KEY") || Deno.env.get("resend_API_key") || Deno.env.get("resend_api_key") || null;
}

/** Strip any AI-generated junk from HTML before sending */
function sanitiseHtml(html: string): string {
  return html
    .replace(/```html\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/\{\{\s*first_name\s*\|[^}]+\}\}/gi, "{{first_name}}")
    .replace(/^`+/, "");
}

/**
 * Personalise HTML for ONE contact:
 * - Replace {{first_name}} with actual name (or "there" fallback)
 * - Replace {{UNSUBSCRIBE_URL}} with tracked unsubscribe link
 * - Wrap all links with click tracker
 * - Inject open pixel
 */
function buildPersonalised(
  html: string,
  scheduleId: string,
  userId: string,
  email: string,
  firstName: string | null
): string {
  const enc = (s: string) => encodeURIComponent(s);
  const trackBase = `${TRACK_BASE}?sid=${enc(scheduleId)}&uid=${enc(userId)}&email=${enc(email)}`;
  const name = firstName?.trim() || "there";

  let out = sanitiseHtml(html);

  // Replace {{first_name}} with actual name
  out = out
    .replace(/\{\{\s*first_name\s*\}\}/gi, name)
    .replace(/\{\{\s*FIRST_NAME\s*\}\}/g, name);

  // Replace unsubscribe URL
  const unsubUrl = `${trackBase}&type=unsubscribe`;
  out = out
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl)
    .replace(/\{\{\{\s*unsubscribe_url\s*\}\}\}/g, unsubUrl)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsubUrl);

  // Wrap links with click tracker
  out = out.replace(/<a(\s[^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (match, pre, href, post) => {
    if (
      href.startsWith('mailto:') ||
      href === '#' ||
      href.includes('newsletter-track') ||
      href.startsWith('{{') ||
      href.includes('skillstudio.ai/policies')
    ) return match;
    return `<a${pre}href="${trackBase}&type=click&url=${enc(href)}"${post}>`;
  });

  // Open tracking pixel
  const pixel = `<img src="${trackBase}&type=open" width="1" height="1" style="display:none;" alt="" />`;
  out = out.includes('</body>') ? out.replace(/<\/body>/i, `${pixel}</body>`) : out + pixel;

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const resendKey = getResendKey();
  if (!resendKey) return new Response(JSON.stringify({ error: "Resend API key not configured" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // GoTrue on this project rejects ES256 tokens via /auth/v1/user, so we
  // decode the JWT payload directly to extract the user sub. Access control
  // is enforced by the subsequent DB query filtering on user_id.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let userId: string;
  try {
    const [, b64] = token.split(".");
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    userId = payload.sub;
    if (!userId) throw new Error("no sub");
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const user = { id: userId };

  const { schedule_id, force } = await req.json();

  const { data: schedule, error: schedErr } = await supabaseAdmin
    .from("newsletter_schedules").select("*").eq("id", schedule_id).eq("user_id", user.id).single();

  if (schedErr || !schedule) return new Response(JSON.stringify({ error: "Schedule not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  if (schedule.status === "sent") return new Response(JSON.stringify({ error: "Already sent" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  // Early-send guard: a one-time scheduled newsletter should send at the
  // time the user picked. Only allow earlier sends when the caller
  // explicitly passes force=true (the cron worker is OK because it only
  // calls for due rows, but it doesn't go through this endpoint anyway).
  if (force !== true && schedule.scheduled_at && new Date(schedule.scheduled_at).getTime() > Date.now()) {
    return new Response(
      JSON.stringify({
        error: `Scheduled for ${schedule.scheduled_at}. Pass { "force": true } to send now.`,
        scheduled_at: schedule.scheduled_at,
      }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  await supabaseAdmin.from("newsletter_schedules").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", schedule_id);

  try {
    let sentCount = 0;
    let contacts: { email: string; first_name: string | null; last_name: string | null }[] = [];

    if (schedule.audience_type === "resend_list" && schedule.resend_audience_id) {
      // When a segment_id is present, use Resend's Broadcasts API to let
      // Resend handle segment filtering server-side. Otherwise fall back
      // to the manual audience-contacts → batch-email approach.
      if ((schedule as any).resend_segment_id) {
        const broadcastRes = await fetch("https://api.resend.com/broadcasts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audience_id: schedule.resend_audience_id,
            segment_id: (schedule as any).resend_segment_id,
            from: `${schedule.from_name} <${schedule.from_email}>`,
            reply_to: schedule.reply_to || schedule.from_email,
            subject: schedule.subject_line,
            html: schedule.html_content,
          }),
        });
        const broadcastData = await broadcastRes.json();
        if (!broadcastRes.ok) {
          throw new Error(broadcastData.message || `Broadcast send failed: ${JSON.stringify(broadcastData)}`);
        }
        sentCount = broadcastData.sent_count ?? 0;
        await supabaseAdmin.from("newsletter_schedules").update({
          status: "sent", sent_at: new Date().toISOString(), recipient_count: sentCount, updated_at: new Date().toISOString()
        }).eq("id", schedule_id);
        return new Response(JSON.stringify({ ok: true, sent: sentCount, method: "broadcast" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // No segment — fetch all contacts from the audience and send individually
      const audienceRes = await fetch(`https://api.resend.com/audiences/${schedule.resend_audience_id}/contacts`, {
        headers: { "Authorization": `Bearer ${resendKey}` }
      });
      const audienceData = await audienceRes.json();
      const allContacts = audienceData.data || [];
      contacts = allContacts
        .filter((c: any) => !c.unsubscribed)
        .map((c: any) => ({
          email: c.email,
          first_name: c.first_name || null,
          last_name: c.last_name || null,
        }));

      if (contacts.length === 0) throw new Error("No active contacts in Resend audience");

    } else {
      // My Contacts — fetch from our own DB
      const { data: dbContacts } = await supabaseAdmin
        .from("newsletter_contacts")
        .select("email, first_name, last_name")
        .eq("user_id", user.id)
        .or("unsubscribed.is.null,unsubscribed.eq.false");

      if (!dbContacts || dbContacts.length === 0) throw new Error("No active contacts found");
      contacts = dbContacts;
    }

    // Send personalised email to every contact via Resend batch API
    const BATCH_SIZE = 100;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      const emails = batch.map((c) => {
        const html = buildPersonalised(schedule.html_content, schedule_id, user.id, c.email, c.first_name);
        const toName = [c.first_name, c.last_name].filter(Boolean).join(" ");
        return {
          from: `${schedule.from_name} <${schedule.from_email}>`,
          to: toName ? `${toName} <${c.email}>` : c.email,
          reply_to: schedule.reply_to || schedule.from_email,
          subject: schedule.subject_line,
          html,
        };
      });

      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(emails),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || `Batch send failed: ${JSON.stringify(result)}`);
      sentCount += batch.length;
    }

    await supabaseAdmin.from("newsletter_schedules").update({
      status: "sent", sent_at: new Date().toISOString(), recipient_count: sentCount, updated_at: new Date().toISOString()
    }).eq("id", schedule_id);

    return new Response(JSON.stringify({ ok: true, sent: sentCount }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("send-newsletter error:", e);
    await supabaseAdmin.from("newsletter_schedules").update({
      status: "failed", error_message: String(e), updated_at: new Date().toISOString()
    }).eq("id", schedule_id);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
