import { useState, useEffect } from "react";
import { User, Key, CreditCard, RefreshCw, Copy, Check, ExternalLink, Lock, Coins } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, STRIPE_URLS, TOP_UP_OPTIONS } from "@/hooks/use-credits";
import { toast } from "sonner";


function TopUpSelector() {
  const [selected, setSelected] = useState("");
  const option = TOP_UP_OPTIONS.find(o => o.value === selected);

  return (
    <div className="flex gap-2">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Select amount…</option>
        {TOP_UP_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <a
        href={option?.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        onClick={e => { if (!option) e.preventDefault(); }}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          option
            ? "bg-primary text-white hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        Buy
      </a>
    </div>
  );
}

const MANAGE_SUBSCRIPTION_URL = "https://billing.stripe.com/p/login/fZu8wOchogNB3VC08K1sQ00";

const Profile = () => {
  const { user } = useAuth();
  const { credits } = useCredits();

  // Profile
  const [name, setName] = useState("");
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
  const [planStarted, setPlanStarted] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.user_metadata?.full_name ?? "");
      fetchApiKey();
      fetchPlan();
    }
  }, [user]);

  async function fetchApiKey() {
    setLoadingKey(true);
    const { data, error } = await supabase.functions.invoke("generate-api-key", { method: "GET" } as any);
    if (!error) setApiKey(data?.key ?? null);
    setLoadingKey(false);
  }

  async function fetchPlan() {
    const { data } = await supabase.from("user_credits").select("plan, plan_started_at").eq("user_id", user!.id).single();
    if (data) { setPlan(data.plan); setPlanStarted(data.plan_started_at); }
  }

  async function handleSaveName() {
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
    setSavingName(false);
    if (error) toast.error(error.message);
    else toast.success("Name updated!");
  }

  async function handlePasswordReset() {
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user!.email!, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) toast.error(error.message);
    else setResetSent(true);
  }

  async function handleGenerateKey() {
    setGeneratingKey(true);
    const { data, error } = await supabase.functions.invoke("generate-api-key", { method: "POST" } as any);
    setGeneratingKey(false);
    if (error) toast.error("Failed to generate key");
    else { setApiKey(data?.key ?? null); toast.success("New API key generated!"); }
  }

  function handleCopyKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied!");
  }

  const planLabel = plan === "free" ? "Free" : plan === "starter" ? "Starter" : plan === "pro" ? "Pro" : plan;
  const planColor = plan === "free" ? "bg-gray-100 text-gray-600" : plan === "starter" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700";

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">My Account</h1>

        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Profile</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1">Email</label>
              <input value={user?.email ?? ""} disabled
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1">Full Name</label>
              <div className="flex gap-2">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <button onClick={handleSaveName} disabled={savingName}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingName ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Password ────────────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Password</h2>
          </div>
          {resetSent ? (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
              ✓ Password reset link sent to <strong>{user?.email}</strong>. Check your inbox.
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Send a password reset link to your email.</p>
              <button onClick={handlePasswordReset} disabled={sendingReset}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${sendingReset ? "animate-spin" : ""}`} />
                {sendingReset ? "Sending…" : "Reset Password"}
              </button>
            </div>
          )}
        </section>

        {/* ── Subscription & Credits ───────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Subscription & Credits</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Current Plan</div>
              <span className={`inline-block px-2.5 py-1 rounded-full text-sm font-semibold ${planColor}`}>
                {planLabel}
              </span>
              {planStarted && (
                <div className="text-xs text-muted-foreground mt-1">
                  Since {new Date(planStarted).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Credits Remaining</div>
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-primary" />
                <span className="text-2xl font-bold text-foreground">{credits ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a href={MANAGE_SUBSCRIPTION_URL} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
              <ExternalLink className="w-4 h-4" />
              Manage Subscription
            </a>
            {plan === "free" && (
              <a href={`${STRIPE_URLS.upgrade}?${new URLSearchParams({ prefilled_email: user?.email ?? "", client_reference_id: user?.id ?? "" }).toString()}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">
                ⚡ Upgrade Plan
              </a>
            )}
          </div>

          {/* Top up credits */}
          <div className="pt-3 border-t border-border">
            <div className="text-sm font-medium text-foreground mb-2">Top Up Credits</div>
            {plan === "free" ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                You need an active subscription to top up credits.{" "}
                <a href={`${STRIPE_URLS.upgrade}?${new URLSearchParams({ prefilled_email: user?.email ?? "", client_reference_id: user?.id ?? "" }).toString()}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                  Upgrade now →
                </a>
              </div>
            ) : (
              <TopUpSelector />
            )}
          </div>
        </section>

        {/* ── API Key ──────────────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Framer Plugin API Key</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste this key into the ContentLab Framer plugin to sync your articles.
          </p>

          {loadingKey ? (
            <div className="h-10 bg-muted rounded-lg animate-pulse" />
          ) : apiKey ? (
            <div className="flex gap-2">
              <code className="flex-1 bg-muted px-3 py-2.5 rounded-lg text-sm font-mono text-foreground truncate border border-border">
                {apiKey}
              </code>
              <button onClick={handleCopyKey}
                className="px-3 py-2 border border-border rounded-lg hover:bg-secondary transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
              No API key yet — generate one below.
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-border">
            <p className="text-xs text-muted-foreground">Regenerating will invalidate the old key.</p>
            <button onClick={handleGenerateKey} disabled={generatingKey}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${generatingKey ? "animate-spin" : ""}`} />
              {apiKey ? "Regenerate Key" : "Generate Key"}
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 mb-1">How to use</p>
            <ol className="text-sm text-blue-800 space-y-0.5 list-decimal list-inside">
              <li>Install ContentLab plugin in Framer from the Marketplace</li>
              <li>Open the plugin and paste your API key</li>
              <li>Click Sync to import your published articles</li>
            </ol>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};

export default Profile;
