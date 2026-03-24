

## Fix Upgrade Plan URLs

The `upgrade` URL in `src/hooks/use-credits.ts` (line 7) currently points to the wrong Stripe link. It needs to be updated to the correct URL provided by the user.

### Change

**`src/hooks/use-credits.ts`** — Update line 7:

```
upgrade: "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00",
```

This single change fixes all "Upgrade Plan" links across the app (Profile page, UpgradeModal, OutOfCreditsDialog) since they all reference `STRIPE_URLS.upgrade`.

