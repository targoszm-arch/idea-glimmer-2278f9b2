import { useState } from "react";
import { useCredits } from "./use-credits";
import type { CreditAction } from "./use-credits";

export function useUpgrade() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const { hasEnough, isPaidPlan } = useCredits();

  // Call before any AI action — returns true if ok to proceed
  function checkCredits(action: CreditAction): boolean {
    if (hasEnough(action)) return true;

    if (isPaidPlan) {
      // Paid subscriber out of credits → show top-up modal
      setShowTopUp(true);
    } else {
      // Free plan → show upgrade modal
      setShowUpgrade(true);
    }
    return false;
  }

  return {
    showUpgrade, setShowUpgrade,
    showTopUp, setShowTopUp,
    checkCredits,
    isPaidPlan,
  };
}
