import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Credits granted per plan
const PLAN_CREDITS = 200; // €50/mo = 200 credits

// Comma-separated Stripe price IDs for the Pro plan tier.
// Set STRIPE_PRO_PRICE_IDS in Supabase edge function secrets.
const PRO_PRICE_IDS = new Set(
  (Deno.env.get("STRIPE_PRO_PRICE_IDS") ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

function planNameForPriceId(priceId: string): string {
  return PRO_PRICE_IDS.has(priceId) ? "pro" : "starter";
}

async function upsertUserCredits(
  adminSupabase: any,
  userId: string,
  stripeCustomerId: string,
  credits: number,
  plan: string,
  status: string
) {
  const { error } = await adminSupabase.from("user_credits").upsert({
    user_id: userId,
    credits,
    plan,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_status: status,
    plan_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) console.error("Credits upsert error:", error);
  else console.log(`✓ Credits set for user ${userId}: ${credits} credits, plan: ${plan}, status: ${status}`);
}

async function findUserId(adminSupabase: any, stripeCustomerId: string, email?: string | null): Promise<string | null> {
  // 1. Look up by stripe_customer_id in user_credits
  const { data: creditRow } = await adminSupabase
    .from("user_credits")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();
  if (creditRow?.user_id) return creditRow.user_id;

  // 2. Look up by email in auth.users
  if (email) {
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    const user = users?.users?.find((u: any) => u.email === email);
    if (user?.id) return user.id;
  }

  return null;
}

serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Stripe event:", event.type);

  switch (event.type) {

    // ── Initial signup / upgrade payment ────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const stripeCustomerId = session.customer as string;
      const email = session.customer_details?.email ?? session.customer_email;

      const resolvedUserId = userId ?? await findUserId(adminSupabase, stripeCustomerId, email);
      if (!resolvedUserId) { console.warn("No user found for checkout session"); break; }

      // Detect plan tier from the purchased price ID
      let priceId = "";
      if (session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          priceId = sub.items.data[0]?.price?.id ?? "";
        } catch {}
      }
      const planName = planNameForPriceId(priceId);

      await upsertUserCredits(adminSupabase, resolvedUserId, stripeCustomerId, PLAN_CREDITS, planName, "active");

      await adminSupabase.auth.admin.updateUserById(resolvedUserId, {
        user_metadata: { stripe_customer_id: stripeCustomerId, plan: planName },
      });
      break;
    }

    // ── Monthly renewal — reset credits ─────────────────────────────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only process subscription invoices (not one-off top-ups)
      if (!invoice.subscription) break;

      const stripeCustomerId = invoice.customer as string;
      const email = invoice.customer_email;

      const resolvedUserId = await findUserId(adminSupabase, stripeCustomerId, email);
      if (!resolvedUserId) { console.warn("No user found for invoice"); break; }

      // Detect plan tier from the invoice line items
      let renewPriceId = "";
      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        renewPriceId = sub.items.data[0]?.price?.id ?? "";
      } catch {}
      const renewPlanName = planNameForPriceId(renewPriceId);

      await upsertUserCredits(adminSupabase, resolvedUserId, stripeCustomerId, PLAN_CREDITS, renewPlanName, "active");
      console.log(`✓ Monthly credits reset for user ${resolvedUserId} (plan: ${renewPlanName})`);
      break;
    }

    // ── Subscription cancelled / expired ────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const stripeCustomerId = sub.customer as string;

      const resolvedUserId = await findUserId(adminSupabase, stripeCustomerId, null);
      if (!resolvedUserId) break;

      // Downgrade to free, keep remaining credits but mark as inactive
      const { error } = await adminSupabase.from("user_credits")
        .update({ plan: "free", stripe_payment_status: "cancelled", updated_at: new Date().toISOString() })
        .eq("user_id", resolvedUserId);

      if (!error) console.log(`✓ Subscription cancelled for user ${resolvedUserId}, downgraded to free`);
      break;
    }

    // ── Payment failed ───────────────────────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;

      const stripeCustomerId = invoice.customer as string;
      const resolvedUserId = await findUserId(adminSupabase, stripeCustomerId, invoice.customer_email);
      if (!resolvedUserId) break;

      await adminSupabase.from("user_credits")
        .update({ stripe_payment_status: "past_due", updated_at: new Date().toISOString() })
        .eq("user_id", resolvedUserId);

      console.log(`⚠ Payment failed for user ${resolvedUserId}`);
      break;
    }

    // ── Subscription paused ──────────────────────────────────────────────────
    case "customer.subscription.paused": {
      const sub = event.data.object as Stripe.Subscription;
      const resolvedUserId = await findUserId(adminSupabase, sub.customer as string, null);
      if (!resolvedUserId) break;

      await adminSupabase.from("user_credits")
        .update({ stripe_payment_status: "paused", updated_at: new Date().toISOString() })
        .eq("user_id", resolvedUserId);
      break;
    }

    // ── Subscription resumed ─────────────────────────────────────────────────
    case "customer.subscription.resumed": {
      const sub = event.data.object as Stripe.Subscription;
      const resolvedUserId = await findUserId(adminSupabase, sub.customer as string, null);
      if (!resolvedUserId) break;

      await adminSupabase.from("user_credits")
        .update({ stripe_payment_status: "active", updated_at: new Date().toISOString() })
        .eq("user_id", resolvedUserId);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
