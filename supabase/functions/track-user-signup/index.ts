// Server-side signup tracking → PostHog.
//
// Fired by a Supabase Database Webhook on INSERT into auth.users. The
// webhook is configured with header `x-webhook-secret: <SIGNUP_WEBHOOK_SECRET>`
// so unauthenticated callers can't spoof signups.
//
// Why server-side instead of frontend tracking:
//   - Exact dedup: one row insert → one event. Frontend retries / refresh
//     can double-count.
//   - Captures email/Google/Apple OAuth signups even when the redirect
//     misses the frontend tracker.
//   - Lets us $set user properties resolved from our own DB (plan,
//     stripe_customer_id, etc.) at signup time.
//
// PostHog event shape:
//   event: "user_signed_up"
//   distinct_id: auth.users.id
//   properties:
//     email, signup_method, signup_source
//     $set: { email, signup_method, signup_date, plan }   ← identifies user
//     $set_once: { initial_signup_source }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://eu.i.posthog.com";
const POSTHOG_API_KEY = Deno.env.get("POSTHOG_PROJECT_API_KEY"); // public "phc_..." key — used for /capture
const SIGNUP_WEBHOOK_SECRET = Deno.env.get("SIGNUP_WEBHOOK_SECRET");

interface AuthUserRow {
  id: string;
  email: string | null;
  created_at: string | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  raw_app_meta_data?: Record<string, unknown> | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: AuthUserRow;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!POSTHOG_API_KEY) {
    console.error("[track-user-signup] POSTHOG_PROJECT_API_KEY not configured");
    return new Response("PostHog not configured", { status: 500 });
  }
  if (!SIGNUP_WEBHOOK_SECRET) {
    console.error("[track-user-signup] SIGNUP_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Shared-secret check — Supabase Database Webhook is configured to send
  // this header so random callers can't spoof signups into our analytics.
  const headerSecret = req.headers.get("x-webhook-secret");
  if (headerSecret !== SIGNUP_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.type !== "INSERT" || payload.schema !== "auth" || payload.table !== "users") {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: "not an auth.users INSERT" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = payload.record;
  if (!user?.id) return new Response("Missing record.id", { status: 400 });

  // Best-effort enrichment: pull plan from user_credits if it's already
  // populated (signup → checkout fast paths). Most signups won't have a
  // row yet — that's fine, we leave plan undefined.
  let plan: string | null = null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: credits } = await admin
      .from("user_credits")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();
    plan = credits?.plan ?? null;
  } catch (e) {
    console.warn("[track-user-signup] user_credits lookup failed:", e);
  }

  const meta = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;
  const appMeta = (user.raw_app_meta_data ?? {}) as Record<string, unknown>;
  const provider = typeof appMeta.provider === "string" ? appMeta.provider : "email";
  const signupMethod = provider; // "email" | "google" | "apple" | etc.
  const signupSource = typeof meta.signup_source === "string" ? meta.signup_source : null;

  const eventBody = {
    api_key: POSTHOG_API_KEY,
    event: "user_signed_up",
    distinct_id: user.id,
    timestamp: user.created_at ?? new Date().toISOString(),
    properties: {
      email: user.email,
      signup_method: signupMethod,
      signup_source: signupSource,
      plan,
      // $set identifies the user in PostHog with these properties.
      $set: {
        email: user.email,
        signup_method: signupMethod,
        signup_date: user.created_at ?? new Date().toISOString(),
        ...(plan ? { plan } : {}),
      },
      // $set_once fields are written exactly once and survive later updates.
      $set_once: {
        initial_signup_source: signupSource,
        initial_signup_method: signupMethod,
      },
    },
  };

  const captureUrl = `${POSTHOG_HOST.replace(/\/$/, "")}/capture/`;
  try {
    const res = await fetch(captureUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[track-user-signup] PostHog returned ${res.status}: ${text.slice(0, 300)}`);
      return new Response(JSON.stringify({ ok: false, status: res.status }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[track-user-signup] PostHog capture threw:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[track-user-signup] tracked user_signed_up for ${user.id} (method=${signupMethod}, plan=${plan ?? "none"})`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
