import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

// Intercom App Store install landing page.
// If the user is logged in → start OAuth immediately.
// If not → send them to login first, then return here.
export default function IntercomConnector() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "starting" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        sessionStorage.setItem("mcp_oauth_return_to", "/connect/intercom");
        navigate("/login", { replace: true });
        return;
      }

      setStatus("starting");
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/intercom-oauth-start`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || "Failed to start Intercom OAuth");
        window.location.href = data.url;
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(e.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-6">
        {status === "error" ? (
          <>
            <p className="text-sm font-medium text-destructive">Could not start Intercom connection</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <a href="/settings/integrations" className="text-xs text-primary underline">
              Go to Integrations →
            </a>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {status === "checking" ? "Checking your account…" : "Redirecting to Intercom…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
