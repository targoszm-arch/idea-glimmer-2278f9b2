## Credits System with Stripe Integration

### Overview

Introduce a credits-based usage system. Free plan gives 10 credits on signup. HeyGen video generation costs 20 credits (30s max). All AI generation (articles, social posts, ideas, cover images, infographics, reel videos) costs credits. When out of credits, users are redirected to the Stripe payment page.

### Credit Costs Per Action


| Action                   | Credits |
| ------------------------ | ------- |
| HeyGen video (30s max)   | 20      |
| Article generation       | 5       |
| Social post generation   | 3       |
| Content ideas generation | 2       |
| Social ideas generation  | 2       |
| Cover image generation   | 5       |
| Infographic generation   | 5       |
| Reel video (Sora)        | 20      |


*(Costs are suggestions — confirm or adjust before implementation.)*

### Stripe Checkout URL

All "buy credits" flows redirect to: `https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f`

---

### Database Changes

**New table: `user_credits**`

```text
user_credits
├── id (uuid, PK)
├── user_id (uuid, NOT NULL, UNIQUE)
├── credits (integer, default 10)
├── plan (text, default 'free')
├── plan_started_at (timestamptz, default now())
├── created_at (timestamptz, default now())
├── updated_at (timestamptz, default now())
```

RLS: Users can SELECT/UPDATE their own row. INSERT on signup via trigger or edge function.

**New table: `credit_transactions**` (audit log)

```text
credit_transactions
├── id (uuid, PK)
├── user_id (uuid, NOT NULL)
├── amount (integer) — negative for deductions
├── action (text) — e.g. 'heygen_video', 'generate_article'
├── created_at (timestamptz, default now())
```

**Database trigger**: On `auth.users` insert → create `user_credits` row with 10 credits via a `SECURITY DEFINER` function (since we can't modify auth schema directly, we use a trigger on a public helper or handle in signup flow).

---

### Implementation Steps

**Step 1 — Database migration**
Create `user_credits` and `credit_transactions` tables with RLS policies. Create a `SECURITY DEFINER` function `deduct_credits(user_id, amount, action)` that atomically checks balance and deducts, returning success/failure. Create a trigger function to auto-create a `user_credits` row when a new user signs up.

**Step 2 — Credits hook (`src/hooks/use-credits.ts`)**
A React hook that:

- Fetches the current user's credit balance from `user_credits`
- Exposes `credits`, `loading`, `refetch()`, and `hasEnough(cost: number)`
- Provides a `redirectToPayment()` helper that opens the Stripe checkout URL

**Step 3 — Gate all AI generation behind credit checks**
Before every AI call, check credits. If insufficient, show a dialog/toast and redirect to payment. Files to update:

- `src/pages/NewArticle.tsx` — article generation, cover image generation
- `src/pages/EditArticle.tsx` — cover image generation
- `src/pages/SocialMedia.tsx` — social post generation, reel video, social ideas
- `src/pages/ContentIdeas.tsx` — content ideas generation, article generation from idea
- `src/components/HeyGenPanel.tsx` — video generation (20 credits, 30s limit)
- `src/components/InfographicDialog.tsx` — infographic generation

**Step 4 — Deduct credits server-side in edge functions**
Each edge function (`generate-article`, `generate-social-post`, `generate-ideas`, `generate-social-ideas`, `generate-cover-image`, `generate-infographic`, `generate-reel-video`, `heygen`) will call `deduct_credits` RPC at the start. If insufficient, return 402. This is the authoritative check — the frontend check is just UX.

**Step 5 — Signup flow update**
Modify `src/pages/Signup.tsx`: after successful Supabase signup, redirect to the Stripe checkout page (`https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f`) so they register their plan. The DB trigger ensures the free 10-credit allocation happens automatically.

**Step 6 — Credits display in UI**
Add a credits badge/counter in the `Header` component showing remaining credits with a "Buy Credits" button linking to the Stripe page.

**Step 7 — "Out of credits" modal component**
A reusable `<OutOfCreditsDialog>` that shows when credits are insufficient, with a CTA button linking to the Stripe payment page.

---

### Technical Details

- **Atomic deduction**: The `deduct_credits` DB function uses `UPDATE ... SET credits = credits - $amount WHERE credits >= $amount RETURNING credits` to prevent race conditions
- **Server-side enforcement**: Edge functions verify credits before processing, returning HTTP 402 if insufficient — prevents bypass
- **HeyGen 30s limit**: Pass `max_duration: 30` in the HeyGen edge function for free plan users
- **Stripe webhook (future)**: A `stripe-webhook` edge function can be added later to automatically top up credits when payment is confirmed. For now, manual or Stripe-hosted flow handles it.  
  
  
IMPORTANT. DISPLAY COUNT OF CREDITS IN THE TOP BAR. DEDUCT CREDITS REALTIME!!!!