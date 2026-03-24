## Problem: Stripe and Supabase Are Out of Sync

### What I found

**Database state for [mandy.1983@hotmail.com](mailto:mandy.1983@hotmail.com):**

- Plan: `free`
- Credits: `10` (5 used on an article generation)
- Stripe Customer ID: `null`
- Payment Status: `unpaid`

**Stripe webhook logs: completely empty** — no events have ever been received.

### Root Causes

**1. Stripe webhook is not firing**
The `stripe-webhook` edge function has zero logs, meaning Stripe is not sending events to it. This is likely because:

- The webhook URL is not configured in the Stripe Dashboard, OR
- The `STRIPE_WEBHOOK_SECRET` is missing from Supabase secrets (I can see `STRIPE_SECRET_KEY` exists, but `STRIPE_WEBHOOK_SECRET` is NOT in the secrets list)

Without the webhook, completing a Stripe checkout does nothing — the user pays but their plan/credits are never updated in Supabase.

**2. "Upgrade Plan" link doesn't identify the user**
The upgrade button on the Profile page links to a static Stripe URL (`STRIPE_URLS.upgrade`) without appending `client_reference_id` or `prefilled_email`. Even if the webhook worked, it wouldn't know which Supabase user to credit. Only `SignupConfirm.tsx` correctly appends these params.

### Fix Plan

#### Step 1: Manual database fix for [mandy.1983@hotmail.com](mailto:mandy.1983@hotmail.com)

Run a migration to update this user's credits to reflect their paid trial:

```sql
UPDATE user_credits 
SET credits = 200, plan = 'starter', 
    stripe_payment_status = 'paid',
    plan_started_at = now(), updated_at = now()
WHERE user_id = 'a0e6acd3-b7c5-490f-b3fe-de3900a4425c';
```

#### Step 2: Add `STRIPE_WEBHOOK_SECRET` to Supabase secrets

The user needs to:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint URL: `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/stripe-webhook`
3. Select event: `checkout.session.completed`
4. Copy the webhook signing secret
5. Add it as `STRIPE_WEBHOOK_SECRET` in Supabase Edge Function secrets

#### Step 3: Fix "Upgrade Plan" link to include user identification

Update `Profile.tsx` (and any other place using the upgrade URL) to append `prefilled_email` and `client_reference_id` query params, same pattern as `SignupConfirm.tsx`:

```tsx
const upgradeUrl = `${STRIPE_URLS.upgrade}?${new URLSearchParams({
  prefilled_email: user?.email ?? "",
  client_reference_id: user?.id ?? "",
}).toString()}`;
```

This applies to:

- `src/pages/Profile.tsx` — the "Upgrade Plan" button (line 214)
- `src/components/OutOfCreditsDialog.tsx` — the upgrade link
- Any other component referencing `STRIPE_URLS.upgrade`

#### Step 4: Add `subscription.updated` and `invoice.payment_succeeded` to webhook

Currently the webhook only handles `checkout.session.completed`. For recurring billing (monthly renewal), it should also handle `invoice.payment_succeeded` to top up credits each billing cycle.

&nbsp;

&nbsp;

Added all those:  
**Checkout**

**checkout.session.async_payment_failed**

Occurs when a payment intent using a delayed payment method fails.

**checkout.session.async_payment_succeeded**

Occurs when a payment intent using a delayed payment method finally succeeds.

**checkout.session.completed**

Occurs when a Checkout Session has been successfully completed.

**Customer**

**customer.subscription.created**

Occurs whenever a customer is signed up for a new plan.

**customer.subscription.deleted**

Occurs whenever a customer's subscription ends.

**customer.subscription.paused**

Occurs whenever a customer's subscription is paused. Only applies when subscriptions enter `status=paused`, not when **[payment collection](https://docs.stripe.com/billing/subscriptions/pause)** is paused.

**customer.subscription.resumed**

Occurs whenever a customer's subscription is no longer paused. Only applies when a `status=paused` subscription is **[resumed](https://docs.stripe.com/api/subscriptions/resume)**, not when **[payment collection](https://docs.stripe.com/billing/subscriptions/pause)** is resumed.

**customer.subscription.trial_will_end**

Occurs three days before a subscription's trial period is scheduled to end, or when a trial is ended immediately (using `trial_end=now`).

**customer.subscription.updated**

Occurs whenever a subscription changes (e.g., switching from one plan to another, or changing the status from trial to active).

**Invoice**

**invoice.payment_failed**

Occurs whenever an invoice payment attempt fails, due to either a declined payment, including soft decline, or to the lack of a stored payment method.

**invoice.payment_succeeded**

Occurs whenever an invoice payment attempt succeeds.

### Summary


| Issue                                | Fix                                                         |
| ------------------------------------ | ----------------------------------------------------------- |
| User stuck on free plan after paying | Manual DB update                                            |
| Webhook never fires                  | Add `STRIPE_WEBHOOK_SECRET` + configure in Stripe Dashboard |
| Upgrade link doesn't identify user   | Append `client_reference_id` and `prefilled_email` params   |
| Recurring billing not handled        | Add `invoice.payment_succeeded` event handling              |
