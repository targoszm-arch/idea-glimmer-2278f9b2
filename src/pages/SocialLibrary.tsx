import { useState, useEffect } from "react";
import { Linkedin, Twitter, Instagram, Copy, Check, Trash2, Search, ExternalLink, Bot, Clock } from "lucide-react";
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
  topic: string | null;
  content: string;
  article_title: string | null;
  article_id: string | null;
  status: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  posted_url: string | null;
  error_message: string | null;
  created_at: string;
}

type StatusFilter = "all" | "scheduled" | "posted" | "failed" | "draft";

const STATUS_STYLE: Record<string, { chip: string; label: string }> = {
  posted: { chip: "bg-green-100 text-green-700", label: "Posted" },
  sent: { chip: "bg-green-100 text-green-700", label: "Sent" },
  scheduled: { chip: "bg-sky-100 text-sky-700", label: "Scheduled" },
  failed: { chip: "bg-red-100 text-red-700", label: "Failed" },
  draft: { chip: "bg-gray-100 text-gray-600", label: "Draft" },
};

// Inner component used both by the standalone `/social-library` route and by
// the "Library" tab inside `/social-media`. Previously the library hid any
// row whose `article_title` was null, which silently filtered out every
// post written by the MCP agent (`schedule_social_post` does not set
// `article_title`). Now we show everything and surface provenance + status
// so the user has one place to see all social content regardless of how it
// was created.
export function SocialLibraryContent() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    // No more `article_title IS NOT NULL` filter — include every saved/scheduled
    // post so MCP-created rows are visible alongside hand-saved ones.
    const { data } = await supabase.from("social_posts" as any)
      .select("id, platform, topic, content, article_title, article_id, status, scheduled_at, posted_at, posted_url, error_message, created_at")
      .eq("user_id", user.id)
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
    if (statusFilter !== "all") {
      const effective = p.status || "draft";
      if (statusFilter === "draft" && (p.status && p.status !== "draft")) return false;
      if (statusFilter !== "draft" && effective !== statusFilter) return false;
    }
    if (search && !p.content.toLowerCase().includes(search.toLowerCase()) &&
      !(p.article_title || "").toLowerCase().includes(search.toLowerCase()) &&
      !(p.topic || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { all: posts.length, linkedin: 0, twitter: 0, instagram: 0 };
  posts.forEach(p => { if (p.platform in counts) (counts as any)[p.platform]++; });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Social Post Library</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All social posts — drafts, scheduled, posted, and failed. Includes
          posts saved from articles, generated here, and scheduled via the
          Claude MCP agent.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
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
                    <span className="opacity-70">({(counts as any)[f]})</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
        {/* Status chip filter — mirrors the Calendar palette */}
        <div className="flex gap-1 flex-wrap">
          {(["all", "scheduled", "posted", "failed", "draft"] as const).map(s => {
            const count = s === "all"
              ? posts.length
              : s === "draft"
                ? posts.filter(p => !p.status || p.status === "draft").length
                : posts.filter(p => p.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "all" ? "All statuses" : STATUS_STYLE[s]?.label || s}
                <span className="opacity-70 ml-1">({count})</span>
              </button>
            );
          })}
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
              ? "No posts yet. Generate from an article, schedule one via the calendar, or ask the Claude agent to draft one."
              : "No posts match your filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(post => {
            const meta = PLATFORM_META[post.platform] || PLATFORM_META.linkedin;
            const statusKey = post.status || "draft";
            const statusStyle = STATUS_STYLE[statusKey] || STATUS_STYLE.draft;
            // "Via MCP" = no article link and no article title — almost certainly
            // written by the Claude agent via `schedule_social_post`.
            const isMcp = !post.article_id && !post.article_title;
            return (
              <div key={post.id} className="border border-border rounded-xl bg-background overflow-hidden">
                {/* Post header */}
                <div className={`flex items-center justify-between px-4 py-2.5 ${meta.bg} border-b border-border/50`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={meta.color}>{meta.icon}</span>
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusStyle.chip}`}>
                      {statusStyle.label}
                    </span>
                    {isMcp && (
                      <span
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700"
                        title="Scheduled via the Claude MCP agent"
                      >
                        <Bot className="h-2.5 w-2.5" /> via MCP
                      </span>
                    )}
                    {post.article_title && (
                      <>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{post.article_title}</span>
                      </>
                    )}
                    {!post.article_title && post.topic && (
                      <>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{post.topic}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground mr-2">
                      {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    {post.status === "posted" && post.posted_url && (
                      <a
                        href={post.posted_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-black/5 text-green-700 transition-colors"
                        title="View on LinkedIn"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
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
                {/* Scheduled-at hint for rows that aren't posted yet */}
                {post.status === "scheduled" && post.scheduled_at && (
                  <div className="px-4 py-1.5 text-[11px] text-sky-700 bg-sky-50/50 border-b border-border/50 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Scheduled for {new Date(post.scheduled_at).toLocaleString()}
                  </div>
                )}
                {post.status === "failed" && post.error_message && (
                  <div className="px-4 py-1.5 text-[11px] text-red-700 bg-red-50/50 border-b border-border/50">
                    {post.error_message}
                  </div>
                )}
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
  );
}

// Standalone page — wraps the shared content in PageLayout.
export default function SocialLibrary() {
  return (
    <PageLayout>
      <SocialLibraryContent />
    </PageLayout>
  );
}
