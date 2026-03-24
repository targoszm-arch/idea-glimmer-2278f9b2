import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REDIRECT_URI = "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/notion-oauth-callback";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const frontendBase = "https://contentlab.skillstudio.ai/settings/integrations";

  if (error) {
    return Response.redirect(`${frontendBase}?error=${encodeURIComponent(error)}&platform=notion`);
  }

  if (!code || !state) {
    return Response.redirect(`${frontendBase}?error=missing_params&platform=notion`);
  }

  try {
    // Decode state to get user_id
    const { user_id } = JSON.parse(atob(state));
    if (!user_id) throw new Error("Invalid state");

    const NOTION_CLIENT_ID = Deno.env.get("NOTION_CLIENT_ID")!;
    const NOTION_CLIENT_SECRET = Deno.env.get("NOTION_CLIENT_SECRET")!;

    // Exchange code for access token
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${btoa(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`)}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || "Token exchange failed");

    // Save to user_integrations
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await supabase.from("user_integrations").upsert({
      user_id,
      platform: "notion",
      access_token: tokenData.access_token,
      platform_user_id: tokenData.workspace_id,
      platform_user_name: tokenData.workspace_name,
      metadata: {
        workspace_icon: tokenData.workspace_icon,
        bot_id: tokenData.bot_id,
        duplicated_template_id: tokenData.duplicated_template_id,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform" });

    // Redirect back to integrations page with success
    return Response.redirect(`${frontendBase}?success=notion_connected`);
  } catch (e) {
    console.error("notion-oauth-callback error:", e);
    return Response.redirect(`${frontendBase}?error=${encodeURIComponent(e instanceof Error ? e.message : "Unknown error")}&platform=notion`);
  }
});
