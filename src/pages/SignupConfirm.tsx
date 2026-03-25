import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const STRIPE_BASE = "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00";

const SignupConfirm = () => {
  useEffect(() => {
    const redirect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email ?? "";
      const userId = session?.user?.id ?? "";

      // Payment Links only support prefilled_email and client_reference_id
      // success_url must be set in Stripe Dashboard → Payment Link → After payment
      const params = new URLSearchParams({
        prefilled_email: email,
        client_reference_id: userId,
      });

      window.location.href = `${STRIPE_BASE}?${params.toString()}`;
    };

    const t = setTimeout(redirect, 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-green-600"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Email confirmed! ✓</h1>
          <p className="text-muted-foreground text-sm">Taking you to complete your subscription…</p>
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
