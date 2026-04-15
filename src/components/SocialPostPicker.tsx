import { useEffect, useState } from "react";
import { X, Linkedin, Twitter, Instagram, PenLine, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Platform = "linkedin" | "twitter" | "instagram";

// Shape passed to the parent when a post is selected. Matches the props the
// parent will forward to SocialPostPreviewModal so the preview/schedule UI
// opens pre-populated.
export interface PickedPost {
  platform: Platform;
  content: string;
  articleId?: string;
  articleTitle?: string;
  topic?: string;
}

interface DraftRow {
  id: string;
  platform: string;
  content: string;
  topic: string | null;
  article_id: string | null;
  article_title: string | null;
  status: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (picked: PickedPost) => void;
}

const PLATFORM_UI: Record<Platform, { label: string; icon: React.ReactNode; bg: string }> = {
  linkedin: { label: "LinkedIn", icon: <Linkedin className="h-4 w-4" />, bg: "bg-[#0A66C2]" },
  twitter: { label: "Twitter / X", icon: <Twitter className="h-4 w-4" />, bg: "bg-[#1DA1F2]" },
  instagram: { label: "Instagram", icon: <Instagram className="h-4 w-4" />, bg: "bg-[#E1306C]" },
};

// Normalize any platform string from the DB (e.g. `instagram_reel`) down to
// the three platforms this picker cares about. Unknown values fall back to
// LinkedIn so the caller always receives a valid Platform.
function normalizePlatform(p: string): Platform {
  if (p === "twitter") return "twitter";
  if (p?.startsWith("instagram")) return "instagram";
  return "linkedin";
}

// Renders before SocialPostPreviewModal to let the user choose *what* to
// schedule: an existing draft from their Social Library, or a blank post on
// a chosen platform. Without this, clicking "Schedule Social Post" on the
// Calendar opened the preview modal with an empty textarea and no context,
// which read to users as a blank screen.
export function SocialPostPicker({ open, onClose, onPick }: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<Platform>("linkedin");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) { setDrafts([]); setLoading(false); } return; }
      // Drafts = rows that haven't been posted or scheduled yet. We treat
      // null status as draft too because older rows may predate the status
      // column being populated.
      const { data } = await supabase
        .from("social_posts" as any)
        .select("id, platform, content, topic, article_id, article_title, status, created_at")
        .eq("user_id", user.id)
        .is("scheduled_at", null)
        .in("status", ["draft"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setDrafts(((data as any) || []) as DraftRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  function pickDraft(row: DraftRow) {
    onPick({
      platform: normalizePlatform(row.platform),
      content: row.content,
      articleId: row.article_id || undefined,
      articleTitle: row.article_title || undefined,
      topic: row.topic || undefined,
    });
  }

  function pickBlank() {
    onPick({ platform, content: "" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-sm">Schedule a Social Post</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pick a draft from your library or start from scratch.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] p-5 space-y-5">
          {/* Write from scratch */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <PenLine className="h-3.5 w-3.5" /> Write from scratch
            </h4>
            <div className="border border-border rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                {(Object.keys(PLATFORM_UI) as Platform[]).map(p => {
                  const meta = PLATFORM_UI[p];
                  const selected = platform === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${selected ? `${meta.bg} text-white border-transparent` : "border-border text-foreground hover:bg-muted"}`}
                    >
                      {meta.icon} {meta.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={pickBlank}
                className="w-full text-sm font-semibold bg-primary text-primary-foreground rounded-lg py-2 hover:bg-primary/90 transition-colors"
              >
                Continue with blank {PLATFORM_UI[platform].label} post
              </button>
            </div>
          </section>

          {/* Drafts */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Your drafts
            </h4>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-4 text-center">
                No drafts yet. Generate posts from the Social Media page or an article, then come back here to schedule them.
              </div>
            ) : (
              <ul className="space-y-2">
                {drafts.map(row => {
                  const p = normalizePlatform(row.platform);
                  const meta = PLATFORM_UI[p];
                  return (
                    <li key={row.id}>
                      <button
                        onClick={() => pickDraft(row)}
                        className="w-full text-left border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors rounded-xl p-3 flex items-start gap-3"
                      >
                        <div className={`w-7 h-7 rounded-lg ${meta.bg} text-white flex items-center justify-center flex-shrink-0`}>
                          {meta.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {row.topic || row.article_title || meta.label + " post"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{row.content}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
