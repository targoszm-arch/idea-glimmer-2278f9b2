import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PaymentSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Logged in — redirect to dashboard after 3s
        setTimeout(() => navigate("/dashboard"), 3000);
      } else {
        // Not logged in — redirect to login after 3s
        setTimeout(() => navigate("/login"), 3000);
      }
    });
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui,sans-serif"
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "48px 40px",
        textAlign: "center", maxWidth: 420, width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)"
      }}>
        <CheckCircle size={56} color="#22c55e" style={{ margin: "0 auto 20px" }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 8 }}>
          Payment Successful!
        </h1>
        <p style={{ fontSize: 15, color: "#666", lineHeight: 1.6, marginBottom: 8 }}>
          Thank you for your payment. Your ContentLab account has been topped up.
        </p>
        <p style={{ fontSize: 13, color: "#999" }}>
          Redirecting you now…
        </p>

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/dashboard" style={{
            background: "#2563EB", color: "#fff", borderRadius: 8,
            padding: "11px 0", fontSize: 14, fontWeight: 600,
            textDecoration: "none", display: "block"
          }}>
            Go to Dashboard →
          </a>
          <a href="/login" style={{
            color: "#2563EB", fontSize: 13, textDecoration: "none"
          }}>
            Sign in to your account
          </a>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
