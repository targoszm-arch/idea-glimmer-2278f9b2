import { useEffect } from "react";

// Stripe checkout URL with success redirect back to ContentLab
const STRIPE_URL = "https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f?success_url=" + 
  encodeURIComponent(window.location.origin + "/framer-success") +
  "&cancel_url=" + encodeURIComponent(window.location.origin + "/signup");

const SignupConfirm = () => {
  useEffect(() => {
    // Small delay so Supabase session is established, then go to Stripe
    const t = setTimeout(() => {
      window.location.href = STRIPE_URL;
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Email confirmed! ✓</h1>
          <p className="text-muted-foreground text-sm">
            Taking you to complete your subscription…
          </p>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary animate-[grow_1.5s_ease-in-out_forwards] rounded-full" 
               style={{width: "0%", animation: "grow 1.5s ease-in-out forwards"}}/>
        </div>
      </div>
      <style>{`@keyframes grow { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
};

export default SignupConfirm;
