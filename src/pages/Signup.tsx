import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const STRIPE_CHECKOUT_URL = "https://buy.stripe.com/fZu8wOchogNB3VC08K1sQ00";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Use magic link (OTP) — no password needed
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking magic link, redirect to Stripe checkout
        emailRedirectTo: `${window.location.origin}/signup/confirm`,
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  // ── "Check your email" screen ──────────────────────────────────────────────
  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-muted-foreground text-sm">
              We sent a magic link to <strong>{email}</strong>.<br />
              Click it to confirm your email and complete signup.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            After confirming, you'll be taken to complete your subscription — then your ContentLab account will be
            ready.
          </div>
          <button onClick={() => setSent(false)} className="text-sm text-primary hover:underline">
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  // ── Signup form ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Content<span className="text-primary">Lab</span>
          </h1>
          <p className="text-sm text-muted-foreground">Create your account — €49/mo includes 200 AI credits</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending magic link…" : "Continue with email →"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">We'll email you a magic link — no password needed.</p>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
