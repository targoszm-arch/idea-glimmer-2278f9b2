import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://www.app.content-lab.ie";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, org_id } = await req.json();
    if (!email || !org_id)
      return json({ error: "email and org_id are required" }, 400);

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, owner_id")
      .eq("id", org_id)
      .single();

    if (!org) return json({ error: "Organization not found" }, 404);
    if (org.owner_id !== user.id)
      return json({ error: "Only the workspace owner can invite" }, 403);

    const { data: existing } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", org_id);

    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const alreadyMember = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (
      alreadyMember &&
      existing?.some((m: any) => m.user_id === alreadyMember.id)
    ) {
      return json({ error: "This person is already a member" }, 409);
    }

    const { data: invite, error: insertErr } = await admin
      .from("organization_invites")
      .insert({
        org_id,
        email: email.toLowerCase(),
        invited_by: user.id,
      })
      .select("token")
      .single();

    if (insertErr) throw insertErr;

    const signupUrl = `${APP_URL}/signup?invite=${invite.token}`;

    const resendKey =
      Deno.env.get("RESEND_API_KEY") ||
      Deno.env.get("resend_API_key") ||
      Deno.env.get("resend_api_key");

    if (resendKey) {
      const { data: aiSettings } = await admin
        .from("ai_settings")
        .select("newsletter_from_email, newsletter_from_name")
        .limit(1)
        .single();

      const fromEmail =
        (aiSettings as any)?.newsletter_from_email || "noreply@content-lab.ie";
      const fromName =
        (aiSettings as any)?.newsletter_from_name || "Content Lab";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [email],
          subject: `You're invited to ${org.name} on Content Lab`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
              <h2 style="color: #111; margin-bottom: 8px;">You're invited!</h2>
              <p style="color: #555; line-height: 1.6;">
                <strong>${user.email}</strong> invited you to join
                <strong>${org.name}</strong> on Content Lab.
              </p>
              <p style="color: #555; line-height: 1.6;">
                You'll be able to view and edit articles, social posts,
                newsletters, and brand assets — all from one place.
              </p>
              <a href="${signupUrl}"
                style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Accept Invite
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 24px;">
                This invite expires in 7 days. If you didn't expect this,
                you can ignore it.
              </p>
            </div>
          `,
        }),
      });
    }

    return json({ ok: true, signup_url: signupUrl });
  } catch (e) {
    console.error("send-team-invite error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
