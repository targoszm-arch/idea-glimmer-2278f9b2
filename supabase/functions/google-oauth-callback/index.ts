import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const frontendBase = "https://contentlab.skillstudio.ai/settings/integrations";

  if (!code || !state) return Response.redirect(`${frontendBase}?error=missing_params&platform=google`);

  try {
    const { user_id } = JSON.parse(atob(state));
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const REDIRECT_URI = "https://contentlab.skillstudio.ai/integrations/google/callback";

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error("Token exchange failed");

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("user_integrations").upsert({
      user_id,
      platform: "google",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      platform_user_id: userData.id,
      platform_user_name: userData.email,
      metadata: { email: userData.email, name: userData.name, picture: userData.picture },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform" });

    return Response.redirect(`${frontendBase}?success=google_connected`);
  } catch (e) {
    return Response.redirect(`${frontendBase}?error=${encodeURIComponent(e instanceof Error ? e.message : "Unknown error")}&platform=google`);
  }
});
