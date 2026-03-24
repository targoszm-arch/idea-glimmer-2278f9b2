import { useState } from "react";
import { useCredits } from "./use-credits";
import type { CreditAction } from "./use-credits";

export function useUpgrade() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { hasEnough, isPaidPlan, credits } = useCredits();

  // Call before any AI action — returns true if ok to proceed
  function checkCredits(action: CreditAction): boolean {
    if (hasEnough(action)) return true;
    setShowUpgrade(true);
    return false;
  }

  return { showUpgrade, setShowUpgrade, checkCredits, isPaidPlan, credits };
}
