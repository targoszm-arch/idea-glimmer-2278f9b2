import { useCredits, STRIPE_URLS } from "@/hooks/use-credits";
import { useAuth } from "@/contexts/AuthContext";
import { X } from "lucide-react";
import { useState } from "react";

export default function TrialBanner() {
  const { user } = useAuth();
  const { isPaidPlan, isTrialActive, isTrialExpired, trialDaysLeft, loading } = useCredits();
  const [dismissed, setDismissed] = useState(false);

  if (loading || !user || isPaidPlan || dismissed) return null;

  if (isTrialExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2 text-sm flex items-center justify-center gap-3">
        <span>⏰ Your free trial has expired.</span>
        <a
          href={`${STRIPE_URLS.upgrade}?prefilled_email=${encodeURIComponent(user.email ?? "")}&client_reference_id=${user.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-bold underline underline-offset-2 hover:no-underline"
        >
          Subscribe now to keep creating →
        </a>
      </div>
    );
  }

  if (isTrialActive) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-sm flex items-center justify-center gap-3">
        <span>
          🎉 Free trial — <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left</strong>
        </span>
        <a
          href={`${STRIPE_URLS.upgrade}?prefilled_email=${encodeURIComponent(user.email ?? "")}&client_reference_id=${user.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-bold underline underline-offset-2 hover:no-underline"
        >
          Upgrade now →
        </a>
        <button onClick={() => setDismissed(true)} className="ml-auto opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
