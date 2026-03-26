import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "confirmed" | "redirecting">("verifying");
  const [planName, setPlanName] = useState("Starter");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Not logged in — go to login
        setTimeout(() => navigate("/login"), 2500);
        setStatus("redirecting");
        return;
      }

      // Poll for credits update (webhook may arrive with a short delay)
      let attempts = 0;
      const maxAttempts = 12; // ~12 × 2.5s = 30s max

      const poll = async () => {
        if (cancelled) return;
        attempts++;

        const { data } = await supabase
          .from("user_credits")
          .select("credits, plan, stripe_payment_status")
          .eq("user_id", session.user.id)
          .maybeSingle();

        const isPaid = data?.stripe_payment_status === "active" && data?.plan !== "free";

        if (isPaid || attempts >= maxAttempts) {
          if (!cancelled) {
            if (data?.plan && data.plan !== "free") setPlanName(capitalize(data.plan));
            setStatus("confirmed");
            setTimeout(() => {
              if (!cancelled) navigate("/dashboard");
            }, 3000);
          }
          return;
        }

        // Not confirmed yet — wait and retry
        setTimeout(poll, 2500);
      };

      poll();
    }

    verify();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui,sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "48px 40px",
        textAlign: "center", maxWidth: 420, width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        {status === "verifying" ? (
          <>
            <Loader2 size={56} color="#2563EB" style={{ margin: "0 auto 20px", animation: "spin 1s linear infinite" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Confirming your payment…
            </h1>
            <p style={{ fontSize: 15, color: "#666", lineHeight: 1.6 }}>
              Just a moment while we activate your account.
            </p>
          </>
        ) : (
          <>
            <CheckCircle size={56} color="#22c55e" style={{ margin: "0 auto 20px" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              {status === "redirecting" ? "Payment received!" : "You're all set! 🎉"}
            </h1>
            <p style={{ fontSize: 15, color: "#666", lineHeight: 1.6, marginBottom: 8 }}>
              {status === "redirecting"
                ? "Your ContentLab account is being activated."
                : `Welcome to the ${planName} plan. Your credits are ready to use.`}
            </p>
            <p style={{ fontSize: 13, color: "#999" }}>
              Taking you to your dashboard…
            </p>
          </>
        )}

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/dashboard" style={{
            background: "#2563EB", color: "#fff", borderRadius: 8,
            padding: "11px 0", fontSize: 14, fontWeight: 600,
            textDecoration: "none", display: "block",
          }}>
            Go to Dashboard →
          </a>
          {status !== "verifying" && (
            <a href="/login" style={{ color: "#2563EB", fontSize: 13, textDecoration: "none" }}>
              Sign in to your account
            </a>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default PaymentSuccess;
