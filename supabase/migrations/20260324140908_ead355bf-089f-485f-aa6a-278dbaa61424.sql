UPDATE user_credits 
SET credits = 20, plan = 'free', 
    stripe_payment_status = 'unpaid',
    updated_at = now()
WHERE user_id = 'a0e6acd3-b7c5-490f-b3fe-de3900a4425c';