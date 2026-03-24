import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const STRIPE_URLS = {
  signup:        "https://buy.stripe.com/4gMfZg81854T77Of3E1sQ04", // test
  upgrade:       "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00",
  topUp25:       "https://buy.stripe.com/6oUcN4gxE0ODgIo2gS1sQ01",
  topUp50:       "https://buy.stripe.com/eVq28qdls1SH3VCf3E1sQ02",
  topUp100:      "https://buy.stripe.com/14AfZg8187d177O6x81sQ03",
  customerPortal:"https://billing.stripe.com/p/login/fZu8wOchogNB3VC08K1sQ00",
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

export const useCredits = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!user) { setCredits(null); setLoading(false); return; }
    const { data, error } = await supabase
      .from("user_credits")
      .select("credits, plan")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setCredits(null);
    } else if (!data) {
      const { data: inserted } = await supabase
        .from("user_credits")
        .insert({ user_id: user.id, credits: 20, plan: "free" })
        .select("credits, plan")
        .single();
      setCredits(inserted?.credits ?? 20);
      setPlan(inserted?.plan ?? "free");
    } else {
      setCredits(data.credits);
      setPlan(data.plan ?? "free");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  const hasEnough = (action: CreditAction) => {
    if (credits === null) return false;
    return credits >= CREDIT_COSTS[action];
  };

  const deductLocally = (action: CreditAction) => {
    setCredits((prev) => (prev !== null ? prev - CREDIT_COSTS[action] : prev));
  };

  const isPaidPlan = plan !== "free";

  return { credits, plan, isPaidPlan, loading, refetch: fetchCredits, hasEnough, deductLocally };
};
