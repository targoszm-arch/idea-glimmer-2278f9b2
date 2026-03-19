import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const STRIPE_URLS = {
  signup: "https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f",
  topUp100: "https://buy.stripe.com/7sY3cv9XBgmHcNKdZh7EQ0g",
  topUp200: "https://buy.stripe.com/fZu7sL2v92vR1526wP7EQ0h",
  customerPortal: "https://billing.stripe.com/p/login/cNi9AT2v91rN3dabR97EQ00",
} as const;

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
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch credits:", error);
      setCredits(null);
    } else if (!data) {
      const { data: inserted } = await supabase
        .from("user_credits")
        .insert({ user_id: user.id, credits: 10, plan: "free" })
        .select("credits")
        .single();
      setCredits(inserted?.credits ?? 10);
    } else {
      setCredits(data.credits);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const hasEnough = (action: CreditAction) => {
    if (credits === null) return false;
    return credits >= CREDIT_COSTS[action];
  };

  const deductLocally = (action: CreditAction) => {
    setCredits((prev) => (prev !== null ? prev - CREDIT_COSTS[action] : prev));
  };

  return {
    credits,
    loading,
    refetch: fetchCredits,
    hasEnough,
    deductLocally,
  };
};
