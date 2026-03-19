import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const frontendBase = "https://contentlab.skillstudio.ai/settings/integrations";

  if (!code || !state) return Response.redirect(`${frontendBase}?error=missing_params&platform=intercom`);

  try {
    const { user_id } = JSON.parse(atob(state));
    const INTERCOM_CLIENT_ID = Deno.env.get("INTERCOM_CLIENT_ID")!;
    const INTERCOM_CLIENT_SECRET = Deno.env.get("INTERCOM_CLIENT_SECRET")!;

    const tokenRes = await fetch("https://api.intercom.io/auth/eagle/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: INTERCOM_CLIENT_ID, client_secret: INTERCOM_CLIENT_SECRET }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.token) throw new Error("Token exchange failed");

    // Get app info
    const appRes = await fetch("https://api.intercom.io/me", {
      headers: { Authorization: `Bearer ${tokenData.token}`, "Intercom-Version": "2.11" },
    });
    const appData = await appRes.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("user_integrations").upsert({
      user_id,
      platform: "intercom",
      access_token: tokenData.token,
      platform_user_id: appData.app?.id_code,
      platform_user_name: appData.app?.name ?? "Intercom Workspace",
      metadata: { app_id: appData.app?.id_code },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform" });

    return Response.redirect(`${frontendBase}?success=intercom_connected`);
  } catch (e) {
    return Response.redirect(`${frontendBase}?error=${encodeURIComponent(e instanceof Error ? e.message : "Unknown error")}&platform=intercom`);
  }
});
