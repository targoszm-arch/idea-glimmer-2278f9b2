// Canva Data Removal Webhook
// Required for marketplace submission — Canva calls this when a user uninstalls the app
// Deploy as a Supabase Edge Function: canva-data-removal

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CANVA_WEBHOOK_SECRET = Deno.env.get("CANVA_WEBHOOK_SECRET") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("x-canva-signature") ?? "";

    // Verify webhook signature
    if (CANVA_WEBHOOK_SECRET) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(CANVA_WEBHOOK_SECRET);
      const msgData = encoder.encode(body);
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      const expected = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (signature !== `sha256=${expected}`) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { user_id, event_type } = payload;

    if (event_type === "USER_DATA_REMOVAL" && user_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Find user by canva_user_id stored in user_integrations
      const { data: integration } = await supabase
        .from("user_integrations")
        .select("user_id")
        .eq("platform", "canva")
        .eq("metadata->>canva_user_id", user_id)
        .maybeSingle();

      if (integration?.user_id) {
        // Remove the Canva integration record
        await supabase
          .from("user_integrations")
          .delete()
          .eq("platform", "canva")
          .eq("user_id", integration.user_id);

        console.log(`Removed Canva integration for user ${integration.user_id}`);
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Canva webhook error:", err);
    return new Response(JSON.stringify({ status: "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
