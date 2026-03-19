
-- Create user_credits table
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  credits integer NOT NULL DEFAULT 10,
  plan text NOT NULL DEFAULT 'free',
  plan_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credits" ON public.user_credits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own credits" ON public.user_credits
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can insert credits" ON public.user_credits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create credit_transactions table (audit log)
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert transactions" ON public.credit_transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Atomic deduct_credits function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
BEGIN
  UPDATE user_credits
  SET credits = credits - p_amount, updated_at = now()
  WHERE user_id = p_user_id AND credits >= p_amount
  RETURNING credits INTO remaining;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO credit_transactions (user_id, amount, action)
  VALUES (p_user_id, -p_amount, p_action);

  RETURN true;
END;
$$;

-- Auto-create user_credits row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits, plan)
  VALUES (NEW.id, 10, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();
