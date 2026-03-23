import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Credits awarded per product
const PLAN_CREDITS: Record<string, { credits: number; plan: string }> = {
  // Match these to your Stripe Price IDs
  signup: { credits: 200, plan: "starter" },    // €49/mo signup
  topup100: { credits: 100, plan: "starter" },  // top up 100
  topup200: { credits: 200, plan: "starter" },  // top up 200
};

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id; // We pass this from SignupConfirm
    const stripeCustomerId = session.customer as string;
    const email = session.customer_details?.email ?? session.customer_email;
    const amountPaid = session.amount_total ?? 0; // in cents

    console.log("Payment completed:", { userId, email, stripeCustomerId, amountPaid });

    // Determine credits based on amount paid
    let creditsToAdd = 200; // default for €49 signup
    let plan = "starter";
    if (amountPaid >= 4900 && amountPaid < 9900) {
      creditsToAdd = 200; plan = "starter";
    } else if (amountPaid >= 9900) {
      creditsToAdd = 500; plan = "pro";
    }

    if (userId) {
      // User came from signup flow — update their existing credits row
      const { error: updateError } = await adminSupabase
        .from("user_credits")
        .upsert({
          user_id: userId,
          credits: creditsToAdd,
          plan,
          plan_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (updateError) console.error("Credits upsert error:", updateError);

      // Store Stripe customer ID against the user
      await adminSupabase.auth.admin.updateUserById(userId, {
        user_metadata: { stripe_customer_id: stripeCustomerId, plan },
      });

      console.log(`✓ Credits added for user ${userId}: ${creditsToAdd} credits, plan: ${plan}`);
    } else if (email) {
      // No userId — look up user by email
      const { data: users } = await adminSupabase.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === email);

      if (user) {
        await adminSupabase.from("user_credits").upsert({
          user_id: user.id,
          credits: creditsToAdd,
          plan,
          plan_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        await adminSupabase.auth.admin.updateUserById(user.id, {
          user_metadata: { stripe_customer_id: stripeCustomerId, plan },
        });

        console.log(`✓ Credits added for user by email ${email}`);
      } else {
        console.warn("No user found for email:", email);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
