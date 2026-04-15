-- Fix credits for mandy.1983@hotmail.com (user_id: a0e6acd3-b7c5-490f-b3fe-de3900a4425c)
-- This user paid for the starter plan but the webhook never fired, so their credits were never updated
UPDATE user_credits 
SET credits = 200, plan = 'starter', 
    stripe_payment_status = 'paid',
    plan_started_at = now(), updated_at = now()
WHERE user_id = 'a0e6acd3-b7c5-490f-b3fe-de3900a4425c';