

## Fix: Correct credits for free users

### What went wrong
I incorrectly set 200 credits for mandy.1983@hotmail.com. Free trial users should get 20 credits, not 200.

### Changes

1. **Migration: Fix mandy.1983@hotmail.com back to free with 20 credits**
```sql
UPDATE user_credits 
SET credits = 20, plan = 'free', 
    stripe_payment_status = 'unpaid',
    updated_at = now()
WHERE user_id = 'a0e6acd3-b7c5-490f-b3fe-de3900a4425c';
```

2. **Migration: Update the `handle_new_user_credits` trigger function** to give new users 20 credits instead of 10:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits, plan)
  VALUES (NEW.id, 20, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

3. **`src/hooks/use-credits.ts`** — Update the fallback insert from 10 to 20 credits (line ~50):
```ts
.insert({ user_id: user.id, credits: 20, plan: "free" })
```
And update the fallback default on line ~52:
```ts
setCredits(inserted?.credits ?? 20);
```

