import { useState, useEffect } from "react";
import { User, Key, CreditCard, Lock, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useCredits, STRIPE_URLS } from "@/hooks/use-credits";
import { toast } from "sonner";

const MANAGE_SUBSCRIPTION_URL = "https://billing.stripe.com/p/login/fZu8wOchogNB3VC08K1sQ00";

const Profile = () => {
  const { credits } = useCredits();
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password reset
  const [resetSent, setResetSent] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // API Key
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Credits / plan
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        setFullName(user.user_metadata?.full_name ?? "");
      }
    });

    supabase.from("user_credits").select("plan, credits").maybeSingle().then(({ data }) => {
      if (data) setPlan(data.plan ?? "free");
    });

    fetchApiKey();
  }, []);

  async function fetchApiKey() {
    setLoadingKey(true);
    const { data } = await supabase.functions.invoke("generate-api-key");
    setApiKey(data?.key ?? null);
    setLoadingKey(false);
  }

  async function handleGenerateKey() {
    setGeneratingKey(true);
    const { data, error } = await supabase.functions.invoke("generate-api-key", { method: "POST" } as any);
    if (error) { toast.error("Failed to generate key"); }
    else { setApiKey(data?.key ?? null); toast.success("New API key generated"); }
    setGeneratingKey(false);
  }

  function handleCopy() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  async function handleSaveName() {
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    setSavingName(false);
    if (error) toast.error(error.message);
    else toast.success("Name updated");
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) toast.error(error.message);
    else { setResetSent(true); toast.success("Password reset email sent"); }
  }

  const planLabel = plan === "free" ? "Free" : plan === "starter" ? "Starter — €49/mo" : plan === "pro" ? "Pro — €99/mo" : plan;
  const planColor = plan === "free" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700";

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Profile</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-white border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><User className="w-4 h-4" /> Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <div className="mt-1 px-3 py-2 rounded-lg bg-muted text-sm">{user?.email}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Full Name</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button onClick={handleSaveName} disabled={savingName}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingName ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription & Credits */}
        <div className="bg-white border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4" /> Subscription & Credits</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold ${planColor}`}>
                {planLabel}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Credits remaining</p>
              <p className="text-2xl font-bold text-primary">{credits ?? 0}</p>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex flex-col gap-2">
            <a href={MANAGE_SUBSCRIPTION_URL} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors w-full justify-center">
              <ExternalLink className="w-4 h-4" />
              Manage Subscription
            </a>
            <div className="flex gap-2">
              <a href={STRIPE_URLS.topUp100} target="_blank" rel="noreferrer"
                className="flex-1 text-center px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Buy 100 credits — €25
              </a>
              <a href={STRIPE_URLS.topUp200} target="_blank" rel="noreferrer"
                className="flex-1 text-center px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Buy 200 credits — €50
              </a>
            </div>
          </div>
        </div>

        {/* API Key */}
        <div className="bg-white border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Key className="w-4 h-4" /> Framer Plugin API Key</h2>
          <p className="text-sm text-muted-foreground">Use this key in the ContentLab Framer plugin to sync your articles.</p>

          {loadingKey ? (
            <div className="h-10 bg-muted rounded-lg animate-pulse" />
          ) : apiKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted rounded-lg px-3 py-2.5 text-sm font-mono truncate">{apiKey}</code>
              <button onClick={handleCopy}
                className="p-2.5 border border-border rounded-lg hover:bg-muted transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2.5">No key yet — generate one below.</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">Regenerating will invalidate your old key.</p>
            <button onClick={handleGenerateKey} disabled={generatingKey}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${generatingKey ? "animate-spin" : ""}`} />
              {apiKey ? "Regenerate" : "Generate Key"}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="bg-white border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Lock className="w-4 h-4" /> Password</h2>
          {resetSent ? (
            <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2.5">
              ✓ Password reset email sent to {user?.email}
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Send a password reset link to your email.</p>
              <button onClick={handlePasswordReset} disabled={sendingReset}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">
                {sendingReset ? "Sending…" : "Reset Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default Profile;
