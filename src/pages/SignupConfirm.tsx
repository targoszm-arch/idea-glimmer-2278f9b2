import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const STRIPE_BASE = "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00";
const TRIAL_DAYS = 14;

type State = "checking" | "go_dashboard" | "go_stripe" | "trial_active" | "trial_expired";

const SignupConfirm = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }

      const userId = session.user.id;
      const email = session.user.email ?? "";

      const { data: credits } = await supabase
        .from("user_credits")
        .select("plan, stripe_payment_status, trial_started_at, trial_ends_at")
        .eq("user_id", userId)
        .single();

      // 1. Active paid subscription → dashboard
      const isPaid =
        credits?.stripe_payment_status === "active" ||
        (credits?.plan && !["free"].includes(credits.plan) && credits?.stripe_payment_status !== "cancelled");

      if (isPaid) {
        setState("go_dashboard");
        setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
        return;
      }

      // 2. Check trial status
      const trialEnd = credits?.trial_ends_at ? new Date(credits.trial_ends_at) : null;
      const now = new Date();

      if (trialEnd && now < trialEnd) {
        // Active trial → go to dashboard
        setState("trial_active");
        setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
        return;
      }

      if (trialEnd && now >= trialEnd) {
        // Trial expired → push to Stripe to subscribe
        setState("trial_expired");
        const params = new URLSearchParams({
          prefilled_email: email,
          client_reference_id: userId,
        });
        setTimeout(() => {
          window.location.href = `${STRIPE_BASE}?${params.toString()}`;
        }, 2000);
        return;
      }

      // 3. Brand new user, no record yet → create trial then go to dashboard
      const trialStarted = new Date();
      const trialEnds = new Date(trialStarted.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await supabase.from("user_credits").upsert({
        user_id: userId,
        credits: 20,
        plan: "free",
        trial_started_at: trialStarted.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      }, { onConflict: "user_id" });

      setState("trial_active");
      setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
    };

    run();
  }, [navigate]);

  const ui: Record<State, { icon: string; title: string; sub: string; color: string }> = {
    checking: {
      icon: "⏳", title: "Email confirmed! ✓",
      sub: "Checking your account…", color: "bg-blue-100",
    },
    go_dashboard: {
      icon: "✓", title: "Welcome back!",
      sub: "You have an active subscription. Taking you to your dashboard…", color: "bg-green-100",
    },
    trial_active: {
      icon: "🎉", title: "You're all set!",
      sub: "Your free trial is active. Taking you to your dashboard…", color: "bg-green-100",
    },
    trial_expired: {
      icon: "⏰", title: "Your trial has ended",
      sub: "Taking you to subscribe and continue creating content…", color: "bg-amber-100",
    },
    go_stripe: {
      icon: "→", title: "Almost there!",
      sub: "Taking you to complete your subscription…", color: "bg-blue-100",
    },
  };

  const { icon, title, sub, color } = ui[state];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${color} text-2xl`}>
          {icon === "✓" ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <span>{icon}</span>
          )}
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm">{sub}</p>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary rounded-full" style={{ width: "0%", animation: "grow 1.5s ease-in-out forwards" }} />
        </div>
      </div>
      <style>{`@keyframes grow { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
};

export default SignupConfirm;
