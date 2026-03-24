import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const frontendBase = "https://content-lab.ie/settings/integrations";

  if (error) return Response.redirect(`${frontendBase}?error=${encodeURIComponent(error)}&platform=shopify`);
  if (!code || !state) return Response.redirect(`${frontendBase}?error=missing_params&platform=shopify`);

  try {
    const { user_id, shop } = JSON.parse(atob(state));
    if (!user_id || !shop) throw new Error("Invalid state");

    const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
    const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

    // Exchange code for token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error("Token exchange failed");

    // Get shop details
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": tokenData.access_token },
    });
    const shopData = await shopRes.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await supabase.from("user_integrations").upsert({
      user_id,
      platform: "shopify",
      access_token: tokenData.access_token,
      platform_user_id: shop,
      platform_user_name: shopData.shop?.name ?? shop,
      metadata: { shop_domain: shop, scope: tokenData.scope },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform" });

    return Response.redirect(`${frontendBase}?success=shopify_connected`);
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    return Response.redirect(`${frontendBase}?error=${encodeURIComponent(e instanceof Error ? e.message : "Unknown error")}&platform=shopify`);
  }
});
