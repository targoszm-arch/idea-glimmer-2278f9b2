import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const STRIPE_BASE = "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00";

const SignupConfirm = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "redirecting_stripe" | "redirecting_dashboard">("checking");

  useEffect(() => {
    const redirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // Not logged in - send to login
        navigate("/login", { replace: true });
        return;
      }

      const email = session.user.email ?? "";
      const userId = session.user.id ?? "";

      // Check if user already has an active paid subscription
      const { data: credits } = await supabase
        .from("user_credits")
        .select("plan, stripe_payment_status")
        .eq("user_id", userId)
        .single();

      const isAlreadyPaid =
        credits?.stripe_payment_status === "active" ||
        credits?.plan === "pro" ||
        credits?.plan === "team" ||
        credits?.plan === "enterprise" ||
        (credits?.plan && credits.plan !== "free");

      if (isAlreadyPaid) {
        // Already subscribed - go straight to dashboard, never re-send to Stripe
        setStatus("redirecting_dashboard");
        setTimeout(() => navigate("/dashboard", { replace: true }), 800);
        return;
      }

      // New user with no subscription - send to Stripe
      setStatus("redirecting_stripe");
      const params = new URLSearchParams({
        prefilled_email: email,
        client_reference_id: userId,
      });

      setTimeout(() => {
        window.location.href = `${STRIPE_BASE}?${params.toString()}`;
      }, 1000);
    };

    redirect();
  }, [navigate]);

  const messages = {
    checking: { title: "Email confirmed! ✓", sub: "Checking your account…" },
    redirecting_stripe: { title: "Email confirmed! ✓", sub: "Taking you to complete your subscription…" },
    redirecting_dashboard: { title: "Welcome back! ✓", sub: "You're already subscribed. Taking you to your dashboard…" },
  };

  const { title, sub } = messages[status];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm">{sub}</p>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: "0%", animation: "grow 1s ease-in-out forwards" }}
          />
        </div>
      </div>
      <style>{`@keyframes grow { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
};

export default SignupConfirm;
