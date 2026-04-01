import { useState } from "react";
import { X, Linkedin, Twitter, Instagram, Send, Calendar, Loader2, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

type Platform = "linkedin" | "twitter" | "instagram" | "instagram_carousel" | "instagram_reel";

interface Props {
  open: boolean;
  onClose: () => void;
  platform: Platform;
  content: string;
  mediaUrl?: string;       // image/video to show in preview
  mediaType?: "image" | "video" | "carousel";
  articleUrl?: string;     // for LinkedIn article link
  articleTitle?: string;
  articleId?: string;
  topic?: string;
  onSaved?: () => void;    // called after save/schedule
}

export const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; charLimit: number }> = {
  linkedin:          { label: "LinkedIn",   icon: <Linkedin className="h-4 w-4" />,  color: "text-[#0A66C2]", bg: "bg-[#0A66C2]", charLimit: 1300 },
  twitter:           { label: "Twitter/X",  icon: <Twitter className="h-4 w-4" />,   color: "text-[#1DA1F2]", bg: "bg-[#1DA1F2]", charLimit: 280  },
  instagram:         { label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
  instagram_carousel:{ label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
  instagram_reel:    { label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
};

export function SocialPostPreviewModal({
  open, onClose, platform, content, mediaUrl, mediaType, articleUrl, articleTitle, articleId, topic, onSaved
}: Props) {
  const [tab, setTab] = useState<"preview" | "schedule">("preview");
  const [editedContent, setEditedContent] = useState(content);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [posted, setPosted] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  const meta = PLATFORM_META[platform] || PLATFORM_META.linkedin;
  const isLinkedIn = platform === "linkedin";
  const charCount = editedContent.length;
  const overLimit = charCount > meta.charLimit;

  async function postNow() {
    if (!isLinkedIn) {
      toast({ title: "Direct posting only supported for LinkedIn currently", description: "For other platforms, copy the content and post manually." });
      return;
    }
    setPosting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ content: editedContent, article_url: articleUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");

      // Save to library as posted
      await supabase.from("social_posts" as any).insert({
        platform, content: editedContent, topic: topic || articleTitle,
        title: articleTitle || topic, article_id: articleId || null,
        article_title: articleTitle || null, status: "posted",
        posted_at: new Date().toISOString(), posted_url: data.post_url || null,
        media_url: mediaUrl || null, media_type: mediaType || null,
      });

      setPosted(true);
      toast({ title: "✓ Posted to LinkedIn!" });
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Post failed", description: e.message, variant: "destructive" });
    }
    setPosting(false);
  }

  async function schedulePost() {
    if (!scheduleDate) return;
    setScheduling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("social_posts" as any).insert({
        user_id: user?.id, platform, content: editedContent,
        topic: topic || articleTitle, title: articleTitle || topic,
        article_id: articleId || null, article_title: articleTitle || null,
        scheduled_at: new Date(scheduleDate).toISOString(), status: "scheduled",
        media_url: mediaUrl || null, media_type: mediaType || null,
      });
      setScheduled(true);
      toast({ title: "✓ Post scheduled!", description: `Will be sent ${new Date(scheduleDate).toLocaleString()}` });
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Schedule failed", description: e.message, variant: "destructive" });
    }
    setScheduling(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center text-white`}>{meta.icon}</div>
            <span className="font-semibold text-sm">{meta.label} Post</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setTab("preview")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Preview</button>
            <button onClick={() => setTab("schedule")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Schedule</button>
            <button onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          {tab === "preview" ? (
            <div className="p-5 space-y-4">
              {/* Mock social post preview */}
              <div className="border border-border rounded-xl overflow-hidden bg-white">
                {/* Platform header bar */}
                <div className={`h-1.5 ${meta.bg}`} />
                <div className="p-4">
                  {/* Fake profile row */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">You</div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Your Name</p>
                      <p className="text-[10px] text-muted-foreground">{meta.label} · Just now</p>
                    </div>
                  </div>
                  {/* Content */}
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{editedContent}</p>
                  {/* Media preview */}
                  {mediaUrl && (
                    <div className="mt-3 rounded-lg overflow-hidden border border-border">
                      {mediaType === "video" ? (
                        <video src={mediaUrl} controls className="w-full max-h-48 object-cover" />
                      ) : (
                        <img src={mediaUrl} alt="media" className="w-full max-h-48 object-cover" />
                      )}
                    </div>
                  )}
                  {/* Article link preview */}
                  {articleUrl && isLinkedIn && (
                    <div className="mt-3 border border-border rounded-lg p-3 flex items-center gap-2 bg-muted/30">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{articleTitle || articleUrl}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Editable content */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Edit before posting</label>
                <textarea
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                  rows={6}
                  className="w-full text-sm border border-border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed"
                />
                <p className={`text-xs mt-1 text-right ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {charCount.toLocaleString()} / {meta.charLimit.toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Choose when to publish this post. It will be saved to your Social Library with a scheduled date.</p>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Send Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Post preview summary */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <p className="text-xs text-muted-foreground line-clamp-3">{editedContent}</p>
              </div>
              {mediaUrl && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {mediaType === "video" ? "🎬 Video attached" : "🖼 Image attached"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex gap-2">
          {tab === "preview" ? (
            <>
              <button onClick={() => setTab("schedule")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                <Calendar className="h-4 w-4" /> Schedule
              </button>
              {isLinkedIn ? (
                <button onClick={postNow} disabled={posting || posted || overLimit}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${posted ? "bg-green-500 text-white" : "bg-[#0A66C2] hover:bg-[#004182] text-white"}`}>
                  {posted ? <Check className="h-4 w-4" /> : posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {posted ? "Posted!" : "Post to LinkedIn"}
                </button>
              ) : (
                <button onClick={() => { navigator.clipboard.writeText(editedContent); toast({ title: "Copied!" }); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                  Copy to Clipboard
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setTab("preview")} className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Back
              </button>
              <button onClick={schedulePost} disabled={scheduling || scheduled || !scheduleDate}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${scheduled ? "bg-green-500 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
                {scheduled ? <Check className="h-4 w-4" /> : scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {scheduled ? "Scheduled!" : "Schedule Post"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
