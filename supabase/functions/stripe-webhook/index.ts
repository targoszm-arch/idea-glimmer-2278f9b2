import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Stripe event received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const stripeCustomerId = session.customer as string;
    const email = session.customer_details?.email ?? session.customer_email;
    const amountPaid = session.amount_total ?? 0;

    console.log("Payment completed:", { userId, email, stripeCustomerId, amountPaid });

    let creditsToAdd = 200;
    let plan = "starter";
    if (amountPaid >= 4900 && amountPaid < 9900) {
      creditsToAdd = 200; plan = "starter";
    } else if (amountPaid >= 9900) {
      creditsToAdd = 500; plan = "pro";
    }

    const targetUserId = userId ?? await findUserIdByEmail(adminSupabase, email);
    if (targetUserId) {
      await adminSupabase.from("user_credits").upsert({
        user_id: targetUserId,
        credits: creditsToAdd,
        plan,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_status: "paid",
        plan_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      await adminSupabase.auth.admin.updateUserById(targetUserId, {
        user_metadata: { stripe_customer_id: stripeCustomerId, plan },
      });

      console.log(`✓ Credits set for user ${targetUserId}: ${creditsToAdd}, plan: ${plan}`);
    } else {
      console.warn("No user found for checkout session:", { userId, email });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeCustomerId = invoice.customer as string;
    const amountPaid = invoice.amount_paid ?? 0;

    // Skip the first invoice (handled by checkout.session.completed)
    if (invoice.billing_reason === "subscription_create") {
      console.log("Skipping first invoice (handled by checkout.session.completed)");
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("Recurring invoice paid:", { stripeCustomerId, amountPaid });

    let creditsToAdd = 200;
    if (amountPaid >= 9900) creditsToAdd = 500;

    // Find user by stripe_customer_id
    const { data: creditRow } = await adminSupabase
      .from("user_credits")
      .select("user_id, credits")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (creditRow) {
      await adminSupabase.from("user_credits").update({
        credits: creditRow.credits + creditsToAdd,
        stripe_payment_status: "paid",
        plan_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", creditRow.user_id);

      console.log(`✓ Recurring credits added for user ${creditRow.user_id}: +${creditsToAdd}`);
    } else {
      console.warn("No user found for stripe customer:", stripeCustomerId);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId = subscription.customer as string;

    const { data: creditRow } = await adminSupabase
      .from("user_credits")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (creditRow) {
      await adminSupabase.from("user_credits").update({
        plan: "free",
        stripe_payment_status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("user_id", creditRow.user_id);

      console.log(`✓ Subscription cancelled for user ${creditRow.user_id}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function findUserIdByEmail(adminSupabase: any, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data: users } = await adminSupabase.auth.admin.listUsers();
  const user = users?.users?.find((u: any) => u.email === email);
  return user?.id ?? null;
}
