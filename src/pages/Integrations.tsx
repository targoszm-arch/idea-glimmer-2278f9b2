import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionHeaders } from "@/lib/edge-function-auth";
import { useToast } from "@/hooks/use-toast";
import PageLayout from "@/components/PageLayout";
import PlatformLogo from "@/components/PlatformLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, ExternalLink, Linkedin, Trash2 } from "lucide-react";

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

function LinkedInConnect() {
  const [connection, setConnection] = useState<{ name: string; picture_url: string; expires_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    load();
    // Check for redirect back from OAuth
    const params = new URLSearchParams(window.location.search);
    const linkedinParam = params.get("linkedin");
    if (linkedinParam === "connected") {
      const name = params.get("name") || "LinkedIn";
      toast({ title: `✓ LinkedIn connected as ${name}!` });
      window.history.replaceState({}, "", window.location.pathname);
      load();
    } else if (linkedinParam === "error") {
      toast({ title: "LinkedIn connection failed", description: params.get("reason") || "", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("linkedin_connections" as any).select("name, picture_url, expires_at").maybeSingle();
    setConnection((data as any) || null);
    setLoading(false);
  }

  async function connect() {
    setConnecting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-oauth-start`, {
      headers: { Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_ANON_KEY },
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else {
      toast({ title: "Failed to start LinkedIn auth", variant: "destructive" });
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect LinkedIn?")) return;
    setDisconnecting(true);
    await supabase.from("linkedin_connections" as any).delete().eq("user_id", (await supabase.auth.getUser()).data.user?.id || "");
    setConnection(null);
    setDisconnecting(false);
    toast({ title: "LinkedIn disconnected" });
  }

  const isExpired = connection?.expires_at && new Date(connection.expires_at) < new Date();

  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold mb-3 text-foreground">Social Publishing</h2>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border border-border bg-[#0A66C2] flex items-center justify-center">
                <Linkedin className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  LinkedIn
                  {loading ? null : connection && !isExpired ? (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" /> Connected
                    </Badge>
                  ) : isExpired ? (
                    <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-xs">
                      Token expired — reconnect
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">
                      <XCircle className="w-3 h-3 mr-1" /> Not connected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {connection && !isExpired
                    ? `Connected as ${connection.name}`
                    : "Publish posts directly to your LinkedIn profile from the article editor"}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              {connection && !isExpired ? (
                <Button size="sm" variant="outline" onClick={disconnect} disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={connect} disabled={connecting}
                  className="bg-[#0A66C2] hover:bg-[#004182] text-white">
                  {connecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Linkedin className="h-3 w-3 mr-1" />}
                  {isExpired ? "Reconnect" : "Connect LinkedIn"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

const PLAN_MAX_COLLECTIONS: Record<string, number> = { free: 0, starter: 1, pro: 5 };
const UPGRADE_URL = "https://buy.stripe.com/8x28wOdlsdBpak09Jk1sQ06";

function FramerCollections() {
  const [collections, setCollections] = useState<{ id: string; collection_id: string }[]>([]);
  const [maxCollections, setMaxCollections] = useState<number>(1);
  const [plan, setPlan] = useState<string>("starter");
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: rows }, { data: credits }] = await Promise.all([
      supabase.from("user_integrations" as any)
        .select("id, collection_id")
        .eq("platform", "framer")
        .not("collection_id", "is", null),
      supabase.from("user_credits" as any).select("plan, stripe_payment_status").single(),
    ]);
    if (rows) setCollections(rows as any);
    if (credits) {
      const p = (credits as any).plan ?? "free";
      const isActive =
        (credits as any).stripe_payment_status === "active" ||
        (p !== "free" && (credits as any).stripe_payment_status !== "cancelled");
      setPlan(p);
      setMaxCollections(isActive ? (PLAN_MAX_COLLECTIONS[p] ?? 1) : 0);
    }
    setLoading(false);
  }

  async function removeCollection(id: string) {
    setRemovingId(id);
    const { error } = await supabase.from("user_integrations" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to remove collection", description: error.message, variant: "destructive" });
    } else {
      setCollections(prev => prev.filter(c => c.id !== id));
      toast({ title: "Collection removed" });
    }
    setRemovingId(null);
  }

  if (loading) return null;
  if (collections.length === 0 && maxCollections === 0) return null;

  const used = collections.length;
  const atLimit = used >= maxCollections;

  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Framer Collections</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {used} of {maxCollections === Infinity ? "unlimited" : maxCollections} slot{maxCollections === 1 ? "" : "s"} used
                {" · "}plan: <span className="capitalize">{plan}</span>
              </CardDescription>
            </div>
            {atLimit && (
              <Button size="sm" variant="outline" asChild>
                <a href={UPGRADE_URL} target="_blank" rel="noreferrer">Upgrade plan</a>
              </Button>
            )}
          </div>
        </CardHeader>
        {collections.length > 0 && (
          <CardContent className="pt-0 pb-4">
            <div className="space-y-2">
              {collections.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[260px]" title={c.collection_id}>
                    {c.collection_id}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    disabled={removingId === c.id}
                    onClick={() => removeCollection(c.id)}
                  >
                    {removingId === c.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

type Platform = "framer" | "notion" | "shopify" | "intercom" | "google" | "wordpress" | "canva" | "confluence";

type Integration = {
  platform: Platform;
  platform_user_name: string | null;
  platform_user_id: string | null;
};

// comingSoon flag hides connect button and shows badge instead
const PLATFORMS = [
  {
    id: "framer" as Platform,
    name: "Framer CMS",
    description: "Publish articles directly to your Framer CMS collection",
    requiresSecrets: true,
  },
  {
    id: "notion" as Platform,
    name: "Notion",
    description: "Sync articles to any Notion database",
  },
  {
    id: "shopify" as Platform,
    name: "Shopify",
    description: "Publish articles to your Shopify blog",
    requiresInput: true,
    inputLabel: "Shopify store domain",
    inputPlaceholder: "mystore.myshopify.com",
  },
  {
    id: "intercom" as Platform,
    name: "Intercom",
    description: "Push articles to Intercom Help Center",
  },
  {
    id: "confluence" as Platform,
    name: "Confluence",
    description: "Publish articles as Confluence pages (surfaces in Jira Service Management help center when linked)",
  },
  {
    id: "wordpress" as Platform,
    name: "WordPress",
    description: "Publish articles directly to your WordPress site",
    requiresSecrets: true,
  },
  {
    id: "google" as Platform,
    name: "Google Workspace",
    description: "Export articles to Google Docs",
  },
  {
    id: "canva" as Platform,
    name: "Canva",
    description: "Design social graphics in Canva and save them directly to ContentLab",
    requiresSecrets: true,
  },
];

export default function Integrations({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [connected, setConnected] = useState<Record<Platform, Integration | null>>({
    framer: null, notion: null, shopify: null, intercom: null, google: null, wordpress: null, canva: null, confluence: null,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [showFramerForm, setShowFramerForm] = useState(false);
  const [framerProjectUrl, setFramerProjectUrl] = useState("");
  const [framerApiKey, setFramerApiKey] = useState("");
  const [framerCollectionId, setFramerCollectionId] = useState("");
  const [savingFramer, setSavingFramer] = useState(false);
  const [showWordPressForm, setShowWordPressForm] = useState(false);
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [testingWP, setTestingWP] = useState(false);
  const [savingWP, setSavingWP] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");

  // Check URL params for OAuth results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const platform = params.get("platform");

    if (success) {
      toast({ title: "Connected!", description: `${success.replace("_connected", "").replace("_", " ")} connected successfully.` });
      window.history.replaceState({}, "", "/settings/integrations");
    }
    if (error) {
      toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", "/settings/integrations");
    }
  }, []);

  // Load connected integrations
  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    setLoading(true);
    const { data } = await supabase.from("user_integrations" as any).select("platform, platform_user_name, platform_user_id");
    if (data) {
      const map: Record<string, Integration | null> = { framer: null, notion: null, shopify: null, intercom: null, google: null, wordpress: null, canva: null };
      for (const item of data as any[]) map[item.platform] = item as Integration;
      setConnected(map as Record<Platform, Integration | null>);
    }
    setLoading(false);
  }

  async function connectPlatform(platform: Platform) {
    const p = PLATFORMS.find(pl => pl.id === platform);
    if ((p as any)?.comingSoon) return;
    if (platform === "framer") {
      setShowFramerForm(true);
      return;
    }
    if (platform === "wordpress") {
      setShowWordPressForm(true);
      return;
    }
    if (platform === "canva") {
      // Canva connects via the Canva App — just mark as connected in user_integrations
      setConnecting("canva");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not logged in");
        await supabase.from("user_integrations" as any).upsert({
          user_id: session.user.id,
          platform: "canva",
          platform_user_name: "Canva",
          platform_user_id: session.user.id,
        }, { onConflict: "user_id,platform" });
        await loadIntegrations();
        toast({ title: "Canva connected!", description: "You can now save Canva designs to ContentLab." });
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setConnecting(null);
      }
      return;
    }
    setConnecting(platform);
    try {
      const headers = await getEdgeFunctionHeaders();
      const body = platform === "shopify" ? { shop: shopifyDomain.trim() } : {};
      const fnName = `${platform}-oauth-start`;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start OAuth");
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setConnecting(null);
    }
  }

  async function testWordPressConnection() {
    setTestingWP(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-publish`, {
        method: "POST", headers,
        body: JSON.stringify({ action: "test_connection", site_url: wpSiteUrl, username: wpUsername, app_password: wpAppPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Connection failed");
      toast({ title: "Connected!", description: `Connected as ${data.display_name} on ${data.site_url}` });
      return true;
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
      return false;
    } finally { setTestingWP(false); }
  }

  async function saveWordPressIntegration() {
    if (!wpSiteUrl.trim() || !wpUsername.trim() || !wpAppPassword.trim()) {
      toast({ title: "Missing fields", description: "All fields are required.", variant: "destructive" });
      return;
    }
    setSavingWP(true);
    try {
      const ok = await testWordPressConnection();
      if (!ok) { setSavingWP(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const siteUrl = wpSiteUrl.trim().startsWith("http") ? wpSiteUrl.trim() : `https://${wpSiteUrl.trim()}`;
      const { error } = await supabase.from("user_integrations" as any).upsert({
        user_id: session.user.id,
        platform: "wordpress",
        access_token: wpAppPassword.trim(),
        platform_user_name: siteUrl,
        metadata: { site_url: siteUrl, username: wpUsername.trim() },
      }, { onConflict: "user_id,platform" });
      if (error) throw error;
      toast({ title: "WordPress connected!" });
      setShowWordPressForm(false);
      setWpSiteUrl(""); setWpUsername(""); setWpAppPassword("");
      await loadIntegrations();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSavingWP(false);
  }

  async function saveFramerIntegration() {
    if (!framerProjectUrl.trim() || !framerApiKey.trim()) {
      toast({ title: "Missing fields", description: "Project URL and API Key are required.", variant: "destructive" });
      return;
    }
    // Ensure URL starts with https://
    const url = framerProjectUrl.trim().startsWith("https://")
      ? framerProjectUrl.trim()
      : `https://${framerProjectUrl.trim()}`;

    setSavingFramer(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase.from("user_integrations").upsert({
        user_id: session.user.id,
        platform: "framer",
        access_token: framerApiKey.trim(),
        platform_user_name: url,
        metadata: {
          project_url: url,
          api_key: framerApiKey.trim(),
          collection_id: framerCollectionId.trim() || null,
        },
      }, { onConflict: "user_id,platform" });

      if (error) throw error;
      toast({ title: "Framer connected!", description: "Your Framer project has been saved." });
      setShowFramerForm(false);
      setFramerProjectUrl(""); setFramerApiKey(""); setFramerCollectionId("");
      await loadIntegrations();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSavingFramer(false);
  }

  async function disconnectPlatform(platform: Platform) {
    await supabase.from("user_integrations" as any).delete().eq("platform", platform);
    setConnected(prev => ({ ...prev, [platform]: null }));
    toast({ title: "Disconnected", description: `${platform} has been disconnected.` });
  }

  if (loading) return (
    <PageLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    </PageLayout>
  );

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">Connect your accounts to publish articles directly from ContentLab.</p>
        </div>

        <div className="grid gap-4">
          {PLATFORMS.map((platform) => {
            const integration = connected[platform.id];
            const isConnected = !!integration;
            const isConnecting = connecting === platform.id;
            const isComingSoon = !!(platform as any).comingSoon;

            return (
              <Card key={platform.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border border-border bg-background flex items-center justify-center p-2">
                        <PlatformLogo platform={platform.id} size={24} />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {platform.name}
                          {isComingSoon ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-xs">
                              Coming Soon
                            </Badge>
                          ) : isConnected ? (
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-xs">
                              <XCircle className="w-3 h-3 mr-1" /> Not connected
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {isConnected ? (integration.platform_user_name ?? "Connected") : platform.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isConnected ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => connectPlatform(platform.id)} disabled={isConnecting}>
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reconnect"}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => disconnectPlatform(platform.id)}>
                            Disconnect
                          </Button>
                        </>
                      ) : isComingSoon ? (
                        <Button size="sm" disabled variant="outline" className="text-muted-foreground">
                          Coming Soon
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => connectPlatform(platform.id)} disabled={isConnecting || (platform.id === "shopify" && !shopifyDomain.trim())}>
                          {isConnecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting…</> : "Connect"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              {platform.id === "wordpress" && showWordPressForm && !isConnected && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Use WordPress Application Passwords (Settings → Users → Edit → Application Passwords).
                    </p>
                    <div className="space-y-2">
                      <Input placeholder="Site URL (e.g. https://myblog.com)" value={wpSiteUrl} onChange={e => setWpSiteUrl(e.target.value)} />
                      <Input placeholder="WordPress Username" value={wpUsername} onChange={e => setWpUsername(e.target.value)} />
                      <Input placeholder="Application Password" type="password" value={wpAppPassword} onChange={e => setWpAppPassword(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={testWordPressConnection} disabled={testingWP || savingWP}>
                        {testingWP ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing…</> : "Test Connection"}
                      </Button>
                      <Button size="sm" onClick={saveWordPressIntegration} disabled={savingWP}>
                        {savingWP ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowWordPressForm(false)}>Cancel</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noreferrer" className="text-primary underline">How to create an Application Password →</a>
                    </p>
                  </div>
                </CardContent>
              )}
              {platform.id === "framer" && showFramerForm && !isConnected && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Enter your Framer project details. Find your API key in Framer → Settings → API.
                    </p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Project URL (e.g. https://mysite.framer.website)"
                        value={framerProjectUrl}
                        onChange={e => setFramerProjectUrl(e.target.value)}
                      />
                      <Input
                        placeholder="Framer API Key"
                        type="password"
                        value={framerApiKey}
                        onChange={e => setFramerApiKey(e.target.value)}
                      />
                      <Input
                        placeholder="Collection ID (optional)"
                        value={framerCollectionId}
                        onChange={e => setFramerCollectionId(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveFramerIntegration} disabled={savingFramer}>
                        {savingFramer ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowFramerForm(false)}>Cancel</Button>
                    </div>
                  </div>
                </CardContent>
              )}

                {/* Shopify needs store domain input before connecting */}
                {platform.requiresInput && !isConnected && (
                  <CardContent className="pt-0">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">{platform.inputLabel}</Label>
                        <Input
                          placeholder={platform.inputPlaceholder}
                          value={shopifyDomain}
                          onChange={(e) => setShopifyDomain(e.target.value)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Framer collection slots */}
        <FramerCollections />

        {/* LinkedIn Section */}
        <LinkedInConnect />

        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>How it works:</strong> Connect your accounts once here. Then on any published article, click the publish button to push it to any connected platform. Your credentials are stored securely and never shared.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
