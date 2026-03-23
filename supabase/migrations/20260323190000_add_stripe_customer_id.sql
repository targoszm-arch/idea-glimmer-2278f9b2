ALTER TABLE user_credits 
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_status text DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_customer ON user_credits(stripe_customer_id);
