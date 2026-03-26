import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const STRIPE_URLS = {
  signup: "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00",
  upgrade: "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00",
  topUp25: "https://buy.stripe.com/6oUcN4gxE0ODgIo2gS1sQ01",
  topUp50: "https://buy.stripe.com/eVq28qdls1SH3VCf3E1sQ02",
  topUp100: "https://buy.stripe.com/14AfZg8187d177O6x81sQ03",
  customerPortal: "https://billing.stripe.com/p/login/fZu8wOchogNB3VC08K1sQ00",
} as const;

export const TOP_UP_OPTIONS = [
  { label: "€25 — 100 credits", value: "25", url: STRIPE_URLS.topUp25 },
  { label: "€50 — 200 credits", value: "50", url: STRIPE_URLS.topUp50 },
  { label: "€100 — 500 credits", value: "100", url: STRIPE_URLS.topUp100 },
] as const;

export const CREDIT_COSTS = {
  heygen_video: 20,
  generate_article: 5,
  generate_social_post: 3,
  generate_ideas: 2,
  generate_social_ideas: 2,
  generate_cover_image: 5,
  generate_infographic: 5,
  generate_reel_video: 20,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export const TRIAL_DAYS = 14;

export const useCredits = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [stripeStatus, setStripeStatus] = useState<string>("unpaid");
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("user_credits")
      .select("credits, plan, stripe_payment_status, trial_started_at, trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setCredits(null);
    } else if (!data) {
      // New user — create record with 14-day trial
      const now = new Date();
      const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const { data: inserted } = await supabase
        .from("user_credits")
        .insert({
          user_id: user.id,
          credits: 20,
          plan: "free",
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEnd.toISOString(),
        })
        .select("credits, plan, stripe_payment_status, trial_started_at, trial_ends_at")
        .single();
      setCredits(inserted?.credits ?? 20);
      setPlan(inserted?.plan ?? "free");
      setStripeStatus(inserted?.stripe_payment_status ?? "unpaid");
      setTrialEndsAt(inserted?.trial_ends_at ? new Date(inserted.trial_ends_at) : trialEnd);
    } else {
      setCredits(data.credits);
      // If Stripe says active, treat as paid even if plan column not yet updated
      const effectivePlan =
        data.stripe_payment_status === "active" && data.plan === "free"
          ? "pro"
          : (data.plan ?? "free");
      setPlan(effectivePlan);
      setStripeStatus(data.stripe_payment_status ?? "unpaid");
      setTrialEndsAt(data.trial_ends_at ? new Date(data.trial_ends_at) : null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Paid = Stripe confirmed active subscription
  const isPaidPlan = stripeStatus === "active" || (plan !== "free" && stripeStatus !== "cancelled");

  // Trial is active = free plan, trial not expired, not yet paid
  const isTrialActive = !isPaidPlan && trialEndsAt !== null && new Date() < trialEndsAt;

  // Trial expired = free plan, trial end date is in the past
  const isTrialExpired = !isPaidPlan && trialEndsAt !== null && new Date() >= trialEndsAt;

  // Days remaining in trial (0 if expired)
  const trialDaysLeft = isTrialActive
    ? Math.max(0, Math.ceil((trialEndsAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const hasEnough = (action: CreditAction) => {
    if (loading || credits === null) return true;
    return credits >= CREDIT_COSTS[action];
  };

  const deductLocally = (action: CreditAction) => {
    setCredits((prev) => (prev !== null ? prev - CREDIT_COSTS[action] : prev));
  };

  return {
    credits,
    plan,
    stripeStatus,
    isPaidPlan,
    isTrialActive,
    isTrialExpired,
    trialDaysLeft,
    trialEndsAt,
    loading,
    refetch: fetchCredits,
    hasEnough,
    deductLocally,
  };
};
