

## Top-Up Credits and Billing Management

### What Changes

**1. Update `OutOfCreditsDialog` with two top-up tiers**
Replace the single "Buy More Credits" button with two options:
- **100 credits — €25**: links to `https://buy.stripe.com/7sY3cv9XBgmHcNKdZh7EQ0g`
- **200 credits — €50**: links to `https://buy.stripe.com/fZu7sL2v92vR1526wP7EQ0h`

**2. Update `Signup.tsx` — clarify the €49 plan grants 200 credits**
Update the signup flow messaging to indicate the €49 plan includes 200 credits. Keep the existing Stripe redirect URL.

**3. Update `use-credits.ts` — set initial credits to 200 for paid plan**
The DB trigger already gives 10 credits on signup. The Stripe webhook (future) or manual top-up would handle the 200 credit allocation for the €49 plan. For now, the `redirectToPayment` function should be updated to no longer point to the signup URL — it should be removed or repurposed since top-up now has two tiers.

**4. Add "Manage Billing" link in the Header**
Add a billing/settings icon button in the header toolbar that opens the Stripe Customer Portal:
`https://billing.stripe.com/p/login/cNi9AT2v91rN3dabR97EQ00`

**5. Update the Help popover in Header**
Add a "Manage Billing" link at the bottom of the credits help popover, alongside the existing "Buy more credits" link.

### Files to Modify
- `src/components/OutOfCreditsDialog.tsx` — two top-up buttons with pricing
- `src/components/Header.tsx` — add "Manage Billing" link in popover and toolbar
- `src/hooks/use-credits.ts` — remove single `redirectToPayment` or keep for backward compat, add top-up URLs as constants
- `src/pages/Signup.tsx` — update messaging to mention 200 credits with €49 plan

### Technical Details
- Three Stripe URLs as constants:
  - Signup/plan: `https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f` (existing)
  - Top-up 100cr: `https://buy.stripe.com/7sY3cv9XBgmHcNKdZh7EQ0g`
  - Top-up 200cr: `https://buy.stripe.com/fZu7sL2v92vR1526wP7EQ0h`
  - Customer portal: `https://billing.stripe.com/p/login/cNi9AT2v91rN3dabR97EQ00`
- No database changes needed — credit allocation from Stripe purchases would be handled by a future webhook

