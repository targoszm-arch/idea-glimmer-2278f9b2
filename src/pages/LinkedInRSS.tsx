import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rss, Copy, Check, ExternalLink, RefreshCw, Pencil } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rnshobvpqegttrpaowxe.supabase.co";

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

type Article = {
  id: string;
  title: string;
  category: string;
  status: string;
  rss_enabled: boolean;
  updated_at: string;
};

export default function LinkedInRSS() {
  const [rssToken, setRssToken] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const feedUrl = rssToken ? `${SUPABASE_URL}/functions/v1/rss-feed?token=${rssToken}` : null;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load or create ai_settings row (for rss_token)
      let { data: settings } = await supabase
        .from("ai_settings")
        .select("id, rss_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!settings) {
        const token = generateToken();
        const { data: inserted } = await supabase
          .from("ai_settings")
          .insert({ user_id: user.id, rss_token: token })
          .select("id, rss_token")
          .single();
        settings = inserted;
      } else if (!settings.rss_token) {
        const token = generateToken();
        await supabase.from("ai_settings").update({ rss_token: token }).eq("id", settings.id);
        settings = { ...settings, rss_token: token };
      }

      setSettingsId(settings?.id ?? null);
      setRssToken(settings?.rss_token ?? null);

      // Load published articles
      const { data: arts } = await supabase
        .from("articles")
        .select("id, title, category, status, rss_enabled, updated_at")
        .eq("user_id", user.id)
        .eq("status", "published")
        .order("updated_at", { ascending: false });

      setArticles(arts ?? []);
      setLoading(false);
    })();
  }, []);

  async function regenerateToken() {
    if (!settingsId) return;
    const token = generateToken();
    await supabase.from("ai_settings").update({ rss_token: token }).eq("id", settingsId);
    setRssToken(token);
    toast({ title: "Feed URL regenerated", description: "Update the URL in LinkedIn." });
  }

  async function toggleArticle(articleId: string, current: boolean) {
    await supabase.from("articles").update({ rss_enabled: !current }).eq("id", articleId);
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, rss_enabled: !current } : a));
  }

  function copyFeedUrl() {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const enabledCount = articles.filter(a => a.rss_enabled).length;

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl bg-[#0A66C2]/10 p-2.5">
            <Rss className="h-5 w-5 text-[#0A66C2]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">LinkedIn RSS</h1>
            <p className="text-sm text-muted-foreground">Stream selected articles to LinkedIn automatically</p>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-6 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy your RSS feed URL below</li>
            <li>Go to <a href="https://www.linkedin.com/help/linkedin/answer/a6275901" target="_blank" rel="noreferrer" className="text-[#0A66C2] hover:underline inline-flex items-center gap-0.5">LinkedIn's RSS import <ExternalLink className="h-3 w-3" /></a> and paste the URL</li>
            <li>Toggle articles on/off to control what LinkedIn posts</li>
          </ol>
        </div>

        {/* Feed URL card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">Your RSS Feed URL</p>
            <button onClick={regenerateToken} title="Regenerate URL" className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {feedUrl ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground font-mono">
                {feedUrl}
              </code>
              <button
                onClick={copyFeedUrl}
                className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          ) : (
            <div className="h-9 w-full rounded-lg bg-muted animate-pulse" />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Keep this URL private — anyone with it can read your feed. Use Regenerate to invalidate the old URL.
          </p>
        </div>

        {/* Article list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Published Articles</p>
            <span className="text-xs text-muted-foreground">{enabledCount} in feed</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : articles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No published articles yet.{" "}
              <Link to="/new" className="text-primary hover:underline">Write one</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {articles.map(article => (
                <div key={article.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{article.title}</p>
                    <p className="text-xs text-muted-foreground">{article.category || "Uncategorized"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/edit/${article.id}`} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit article">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleArticle(article.id, article.rss_enabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${article.rss_enabled ? "bg-[#0A66C2]" : "bg-input"}`}
                      role="switch"
                      aria-checked={article.rss_enabled}
                      title={article.rss_enabled ? "Remove from feed" : "Add to feed"}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${article.rss_enabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
