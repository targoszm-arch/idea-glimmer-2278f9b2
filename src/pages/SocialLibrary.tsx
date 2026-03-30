import { useState, useEffect } from "react";
import { Linkedin, Twitter, Instagram, Copy, Check, Trash2, Search, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PageLayout from "@/components/PageLayout";

type Platform = "linkedin" | "twitter" | "instagram";

const PLATFORM_META: Record<Platform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  linkedin: { label: "LinkedIn", icon: <Linkedin className="h-4 w-4" />, color: "text-[#0A66C2]", bg: "bg-blue-50" },
  twitter: { label: "Twitter / X", icon: <Twitter className="h-4 w-4" />, color: "text-[#1DA1F2]", bg: "bg-sky-50" },
  instagram: { label: "Instagram", icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-pink-50" },
};

interface SocialPost {
  id: string;
  platform: Platform;
  content: string;
  article_title: string | null;
  article_id: string | null;
  created_at: string;
}

export default function SocialLibrary() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("social_posts" as any)
      .select("id, platform, content, article_title, article_id, created_at")
      .eq("user_id", user.id)
      .not("article_title", "is", null)
      .order("created_at", { ascending: false });
    setPosts((data as any) || []);
    setLoading(false);
  }

  async function copyPost(post: SocialPost) {
    await navigator.clipboard.writeText(post.content);
    setCopied(post.id);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copied to clipboard!" });
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    setDeleting(id);
    await supabase.from("social_posts" as any).delete().eq("id", id);
    setPosts(prev => prev.filter(p => p.id !== id));
    setDeleting(null);
    toast({ title: "Post deleted" });
  }

  const filtered = posts.filter(p => {
    if (filter !== "all" && p.platform !== filter) return false;
    if (search && !p.content.toLowerCase().includes(search.toLowerCase()) &&
      !(p.article_title || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { all: posts.length, linkedin: 0, twitter: 0, instagram: 0 };
  posts.forEach(p => { counts[p.platform as Platform]++; });

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Social Post Library</h1>
          <p className="text-muted-foreground text-sm mt-1">Posts saved from your articles. Copy and paste to your social channels.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "linkedin", "twitter", "instagram"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "all" ? (
                  <span>All <span className="opacity-70">({counts.all})</span></span>
                ) : (
                  <>
                    <span className={PLATFORM_META[f].color}>{PLATFORM_META[f].icon}</span>
                    <span className="hidden sm:inline">{PLATFORM_META[f].label}</span>
                    <span className="opacity-70">({counts[f]})</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0
                ? "No saved posts yet. Generate social posts from any article and click Save."
                : "No posts match your filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(post => {
              const meta = PLATFORM_META[post.platform];
              return (
                <div key={post.id} className="border border-border rounded-xl bg-background overflow-hidden">
                  {/* Post header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 ${meta.bg} border-b border-border/50`}>
                    <div className="flex items-center gap-2">
                      <span className={meta.color}>{meta.icon}</span>
                      <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      {post.article_title && (
                        <>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{post.article_title}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-2">
                        {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                      {post.article_id && (
                        <a
                          href={`/edit/${post.article_id}`}
                          className="p-1.5 rounded hover:bg-black/5 text-muted-foreground transition-colors"
                          title="Go to article"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => copyPost(post)}
                        className="p-1.5 rounded hover:bg-black/5 text-muted-foreground transition-colors"
                        title="Copy"
                      >
                        {copied === post.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => deletePost(post.id)}
                        disabled={deleting === post.id}
                        className="p-1.5 rounded hover:bg-black/5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Post content */}
                  <div className="px-4 py-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{post.content}</p>
                  </div>
                  {/* Copy bar */}
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => copyPost(post)}
                      className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${
                        copied === post.id
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
                      }`}
                    >
                      {copied === post.id ? "✓ Copied!" : "Copy to Clipboard"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
