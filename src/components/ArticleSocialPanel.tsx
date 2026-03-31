import { useState, useEffect } from "react";
import { Linkedin, Twitter, Instagram, Copy, Check, Loader2, RefreshCw, X, BookmarkPlus, Bookmark, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

type Platform = "linkedin" | "twitter" | "instagram";

const PLATFORMS: { id: Platform; label: string; icon: React.ReactNode; color: string; charLimit: number }[] = [
  { id: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-4 w-4" />, color: "text-[#0A66C2]", charLimit: 1300 },
  { id: "twitter", label: "Twitter / X", icon: <Twitter className="h-4 w-4" />, color: "text-[#1DA1F2]", charLimit: 280 },
  { id: "instagram", label: "Instagram", icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", charLimit: 2200 },
];

interface Props {
  articleContent: string;
  articleTitle: string;
  articleId?: string | null;
  onClose: () => void;
}

export function ArticleSocialPanel({ articleContent, articleTitle, articleId, onClose }: Props) {
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [generated, setGenerated] = useState<Record<Platform, string>>({ linkedin: "", twitter: "", instagram: "" });
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<Platform, boolean>>({ linkedin: false, twitter: false, instagram: false });
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("linkedin_connections" as any).select("linkedin_id").maybeSingle().then(({ data }) => {
      setLinkedinConnected(!!data);
    });
  }, []);

  const currentPost = generated[platform];
  const currentPlatform = PLATFORMS.find(p => p.id === platform)!;

  async function generate(p: Platform) {
    setGenerating(true);
    setPlatform(p);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const plainText = articleContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-social-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ platform: p, topic: articleTitle, article_content: plainText }),
      });

      if (!res.ok || !res.body) throw new Error("Generation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              setGenerated(prev => ({ ...prev, [p]: accumulated }));
            }
          } catch {}
        }
      }
      // Reset saved state when regenerated
      setSaved(prev => ({ ...prev, [p]: false }));
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  }

  async function postToLinkedIn() {
    if (!currentPost) return;
    setPosting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ content: currentPost }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");
      setPosted(true);
      setTimeout(() => setPosted(false), 4000);
      toast({
        title: "✓ Posted to LinkedIn!",
        description: data.post_url ? "View your post on LinkedIn" : undefined,
      });
    } catch (e: any) {
      if (e.message?.includes("TOKEN_EXPIRED") || e.message?.includes("not connected")) {
        toast({ title: "LinkedIn not connected", description: "Go to Integrations to connect your LinkedIn account", variant: "destructive" });
      } else {
        toast({ title: "Post failed", description: e.message, variant: "destructive" });
      }
    }
    setPosting(false);
  }

  async function saveToLibrary() {
    if (!currentPost) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { error } = await supabase.from("social_posts" as any).insert({
        user_id: user.id,
        platform,
        content: currentPost,
        article_id: articleId || null,
        article_title: articleTitle,
        title: `${currentPlatform.label} — ${articleTitle.slice(0, 60)}`,
        topic: articleTitle,
        status: "draft",
      });

      if (error) throw error;
      setSaved(prev => ({ ...prev, [platform]: true }));
      toast({ title: "Saved to Social Library!", description: "Find it under Publish → Social Posts" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(currentPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard!" });
  }

  const charCount = currentPost.length;
  const isOverLimit = charCount > currentPlatform.charLimit;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Convert to Social Post</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 p-3 border-b border-border flex-shrink-0">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => {
              setPlatform(p.id);
              if (!generated[p.id]) generate(p.id);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors relative ${
              platform === p.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.icon}
            <span className="hidden sm:inline">{p.label}</span>
            {saved[p.id] && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white" />
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3">
        {!currentPost && !generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className={`${currentPlatform.color}`}>{currentPlatform.icon}</div>
            <p className="text-sm text-muted-foreground">Generate a {currentPlatform.label} post from this article</p>
            <button
              onClick={() => generate(platform)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Generate Post
            </button>
          </div>
        ) : generating && !currentPost ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Writing {currentPlatform.label} post...</span>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={currentPost}
              onChange={e => {
                setGenerated(prev => ({ ...prev, [platform]: e.target.value }));
                setSaved(prev => ({ ...prev, [platform]: false }));
              }}
              className="w-full text-sm text-foreground bg-background border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed"
              rows={16}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className={isOverLimit ? "text-destructive font-medium" : ""}>
                {charCount.toLocaleString()} / {currentPlatform.charLimit.toLocaleString()} chars
                {isOverLimit && " — over limit"}
              </span>
              {generating && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> writing...
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {currentPost && (
        <div className="flex gap-2 p-3 border-t border-border flex-shrink-0">
          <button
            onClick={() => generate(platform)}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
            Regenerate
          </button>
          <button
            onClick={saveToLibrary}
            disabled={saving || saved[platform]}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
              saved[platform]
                ? "border-green-500/30 bg-green-50 text-green-700"
                : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            {saved[platform] ? <Bookmark className="h-3.5 w-3.5" /> : saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            {saved[platform] ? "Saved" : "Save"}
          </button>
          {platform === "linkedin" && (
            <button
              onClick={linkedinConnected ? postToLinkedIn : () => window.location.href = "/integrations"}
              disabled={posting}
              title={linkedinConnected ? "Post to LinkedIn" : "Connect LinkedIn in Integrations"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                posted
                  ? "bg-green-500 text-white"
                  : linkedinConnected
                  ? "bg-[#0A66C2] hover:bg-[#004182] text-white"
                  : "bg-muted border border-border text-muted-foreground"
              }`}
            >
              {posted ? <Check className="h-3.5 w-3.5" /> : posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Linkedin className="h-3.5 w-3.5" />}
              {posted ? "Posted!" : linkedinConnected ? "Post" : "Connect"}
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

