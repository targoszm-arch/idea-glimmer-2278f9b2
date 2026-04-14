// Cron worker for due newsletter sends.
//
// pg_cron job #6 hits this every 5 minutes. Atomically claims up to 10
// due rows via the `claim_due_newsletters` RPC (FOR UPDATE SKIP LOCKED),
// flips them to 'sending' in the same transaction, and sends each via
// Resend. A second concurrent invocation skips the locked rows, so a
// single newsletter is never picked up by two workers.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const TRACK_BASE = `${SUPABASE_URL}/functions/v1/newsletter-track`;

function sanitiseHtml(html: string): string {
  return html
    .replace(/```html\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/\{\{\s*first_name\s*\|[^}]+\}\}/gi, "{{first_name}}")
    .replace(/^`+/, "");
}

function buildPersonalised(html: string, scheduleId: string, userId: string, email: string, firstName: string | null): string {
  const enc = (s: string) => encodeURIComponent(s);
  const trackBase = `${TRACK_BASE}?sid=${enc(scheduleId)}&uid=${enc(userId)}&email=${enc(email)}`;
  const name = firstName?.trim() || "there";
  let out = sanitiseHtml(html);
  out = out.replace(/\{\{\s*first_name\s*\}\}/gi, name).replace(/\{\{\s*FIRST_NAME\s*\}\}/g, name);
  const unsubUrl = `${trackBase}&type=unsubscribe`;
  out = out.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl).replace(/\{\{\{\s*unsubscribe_url\s*\}\}\}/g, unsubUrl);
  out = out.replace(/<a(\s[^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (match, pre, href, post) => {
    if (href.startsWith('mailto:') || href === '#' || href.includes('newsletter-track') || href.startsWith('{{') || href.includes('skillstudio.ai/policies')) return match;
    return `<a${pre}href="${trackBase}&type=click&url=${enc(href)}"${post}>`;
  });
  const pixel = `<img src="${trackBase}&type=open" width="1" height="1" style="display:none;" alt="" />`;
  return out.includes('</body>') ? out.replace(/<\/body>/i, `${pixel}</body>`) : out + pixel;
}

serve(async (_req) => {
  const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("resend_API_key");
  if (!resendKey) return new Response(JSON.stringify({ error: "No Resend key" }), { status: 500 });

  // Atomic claim — see migration 20260413000000_claim_due_newsletters.
  // Replaces the old SELECT…LIMIT 10 / per-row UPDATE pattern that let
  // two concurrent runs grab the same row.
  const { data: due, error } = await supabaseAdmin.rpc("claim_due_newsletters", { p_limit: 10 });

  if (error) {
    console.error("[process-newsletter-queue] claim_due_newsletters failed:", error);
    return new Response(JSON.stringify({ processed: 0, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  let processed = 0;
  for (const schedule of due) {
    try {
      // Fetch contacts
      let contacts: { email: string; first_name: string | null; last_name: string | null }[] = [];
      if (schedule.audience_type === "resend_list" && schedule.resend_audience_id) {
        const res = await fetch(`https://api.resend.com/audiences/${schedule.resend_audience_id}/contacts`, {
          headers: { "Authorization": `Bearer ${resendKey}` }
        });
        const data = await res.json();
        contacts = (data.data || []).filter((c: any) => !c.unsubscribed).map((c: any) => ({
          email: c.email, first_name: c.first_name || null, last_name: c.last_name || null
        }));
        if (contacts.length === 0) throw new Error("No active contacts in Resend audience");
      } else {
        const { data: dbContacts } = await supabaseAdmin
          .from("newsletter_contacts").select("email, first_name, last_name")
          .eq("user_id", schedule.user_id).or("unsubscribed.is.null,unsubscribed.eq.false");
        if (!dbContacts || dbContacts.length === 0) throw new Error("No active contacts found");
        contacts = dbContacts;
      }

      // Send personalised batch
      const BATCH_SIZE = 100;
      let sentCount = 0;
      for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE);
        const emails = batch.map((c) => {
          const personalised = buildPersonalised(schedule.html_content, schedule.id, schedule.user_id, c.email, c.first_name);
          const toName = [c.first_name, c.last_name].filter(Boolean).join(" ");
          return {
            from: `${schedule.from_name} <${schedule.from_email}>`,
            to: toName ? `${toName} <${c.email}>` : c.email,
            reply_to: schedule.reply_to || schedule.from_email,
            subject: schedule.subject_line,
            html: personalised,
          };
        });
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(emails),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || "Batch send failed");
        sentCount += batch.length;
      }

      await supabaseAdmin.from("newsletter_schedules").update({
        status: "sent", sent_at: new Date().toISOString(), recipient_count: sentCount, updated_at: new Date().toISOString()
      }).eq("id", schedule.id);

      processed++;
    } catch (e: any) {
      await supabaseAdmin.from("newsletter_schedules").update({
        status: "failed", error_message: String(e), updated_at: new Date().toISOString()
      }).eq("id", schedule.id);
    }
  }

  return new Response(JSON.stringify({ processed }), { headers: { "Content-Type": "application/json" } });
});
