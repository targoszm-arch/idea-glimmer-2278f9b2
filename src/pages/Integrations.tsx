import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionHeaders } from "@/lib/edge-function-auth";
import { useToast } from "@/hooks/use-toast";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";

type Platform = "notion" | "shopify" | "intercom" | "google";

type Integration = {
  platform: Platform;
  platform_user_name: string | null;
  platform_user_id: string | null;
};

const PLATFORM_LOGOS: Record<string, string> = {
  notion: "https://www.notion.so/images/favicon.ico",
  shopify: "https://cdn.shopify.com/shopifycloud/web/assets/v1/favicon.ico",
  intercom: "https://static.intercomassets.com/assets/favicon-48x48-be7e72c76d5c79763bb3e46b97e7d6b8.png",
  google: "https://www.google.com/favicon.ico",
};

const PLATFORMS = [
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
    id: "google" as Platform,
    name: "Google Workspace",
    description: "Export articles to Google Docs",
  },
];

export default function Integrations() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<Record<Platform, Integration | null>>({
    notion: null, shopify: null, intercom: null, google: null,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
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
    const { data } = await supabase.from("user_integrations").select("platform, platform_user_name, platform_user_id");
    if (data) {
      const map: Record<string, Integration | null> = { notion: null, shopify: null, intercom: null, google: null };
      for (const item of data) map[item.platform] = item as Integration;
      setConnected(map as Record<Platform, Integration | null>);
    }
    setLoading(false);
  }

  async function connectPlatform(platform: Platform) {
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

  async function disconnectPlatform(platform: Platform) {
    await supabase.from("user_integrations").delete().eq("platform", platform);
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

            return (
              <Card key={platform.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border border-border bg-background flex items-center justify-center p-2">
                        <img src={PLATFORM_LOGOS[platform.id]} alt={platform.name} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {platform.name}
                          {isConnected ? (
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
                      ) : (
                        <Button size="sm" onClick={() => connectPlatform(platform.id)} disabled={isConnecting || (platform.id === "shopify" && !shopifyDomain.trim())}>
                          {isConnecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting…</> : "Connect"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

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

        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>How it works:</strong> Connect your accounts once here. Then on any published article, click the publish button to push it to any connected platform. Your credentials are stored securely and never shared.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
