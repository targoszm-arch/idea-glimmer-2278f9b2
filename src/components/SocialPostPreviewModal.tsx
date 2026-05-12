import { useEffect, useState } from "react";
import { X, Linkedin, Twitter, Instagram, Send, Calendar, Loader2, Check, ExternalLink, ChevronDown, ChevronUp, ImagePlus, Trash2, Sparkles } from "lucide-react";
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
  // Reschedule mode: when `existingPostId` is set, Save updates that row
  // instead of inserting a new one and `initialScheduledAt` pre-populates
  // the datetime picker. SocialLibrary (Reschedule button) and Calendar
  // (Reschedule affordance on scheduled rows) reuse this single modal so
  // we don't grow a second scheduling UI.
  existingPostId?: string;
  initialTab?: "preview" | "schedule";
  initialScheduledAt?: string;
  onSaved?: () => void;    // called after save/schedule
}

export const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; charLimit: number }> = {
  linkedin:          { label: "LinkedIn",   icon: <Linkedin className="h-4 w-4" />,  color: "text-[#0A66C2]", bg: "bg-[#0A66C2]", charLimit: 1300 },
  twitter:           { label: "Twitter/X",  icon: <Twitter className="h-4 w-4" />,   color: "text-[#1DA1F2]", bg: "bg-[#1DA1F2]", charLimit: 280  },
  instagram:         { label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
  instagram_carousel:{ label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
  instagram_reel:    { label: "Instagram",  icon: <Instagram className="h-4 w-4" />, color: "text-[#E1306C]", bg: "bg-[#E1306C]", charLimit: 2200 },
};

// Convert an ISO datetime (from DB) to the local `YYYY-MM-DDTHH:MM` shape
// that <input type="datetime-local"> expects. Returns the default
// "tomorrow 9am local" when no ISO is supplied.
function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(9, 0, 0, 0); return x; })();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SocialPostPreviewModal({
  open, onClose, platform, content, mediaUrl, mediaType, articleUrl, articleTitle, articleId, topic, existingPostId, initialScheduledAt, onSaved, initialTab
}: Props) {
  const isReschedule = !!existingPostId;
  const [tab, setTab] = useState<"preview" | "schedule">(initialTab ?? (isReschedule ? "schedule" : "preview"));
  const [editedContent, setEditedContent] = useState(content);
  const [scheduleDate, setScheduleDate] = useState(() => toLocalInputValue(initialScheduledAt));
  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [posted, setPosted] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  // Preview is collapsed by default when editing an existing post (the user
  // is here to rewrite, not admire). New drafts: expanded so user sees what
  // the AI generated.
  const [previewOpen, setPreviewOpen] = useState(!existingPostId);
  // User-uploaded image overrides the article cover passed in via props.
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState<string | null>(null);
  const [uploadedMediaType, setUploadedMediaType] = useState<"image" | "video" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiVideoOpen, setAiVideoOpen] = useState(false);
  const [aiVideoTemplate, setAiVideoTemplate] = useState("");
  const [aiVideoStarting, setAiVideoStarting] = useState(false);
  const [genImageLoading, setGenImageLoading] = useState(false);
  const { toast } = useToast();

  // The image actually shown in the preview + saved to the row.
  const effectiveMediaUrl = uploadedMediaUrl ?? mediaUrl ?? null;
  const effectiveMediaType = uploadedMediaType ?? mediaType ?? null;

  // The parent keeps a single instance of this modal mounted and toggles
  // `open` + swaps `content`. Because `useState(content)` only reads the
  // initial value on mount, the textarea would stay stuck on whatever content
  // was in place the first time the modal rendered (usually "" — the idle
  // state). Re-sync editedContent and reset transient flags every time the
  // modal opens or receives new content.
  useEffect(() => {
    if (!open) return;
    setEditedContent(content);
    // In reschedule mode the user is explicitly editing a scheduled row,
    // so jump straight to the Schedule tab and preload the existing date.
    setTab(initialTab ?? (isReschedule ? "schedule" : "preview"));
    setScheduleDate(toLocalInputValue(initialScheduledAt));
    setPosted(false);
    setScheduled(false);
    setPreviewOpen(!isReschedule);
    setUploadedMediaUrl(null);
    setUploadedMediaType(null);
  }, [open, content, isReschedule, initialScheduledAt, initialTab]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: "File too large", description: `Max ${isVideo ? "200" : "10"}MB. Compress and retry.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
      const bucket = isVideo ? "reel-videos" : "article-covers";
      const path = `${isVideo ? "social-post-videos" : "social-post-images"}/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      setUploadedMediaUrl(data.publicUrl);
      setUploadedMediaType(isVideo ? "video" : "image");
      toast({ title: isVideo ? "Video attached" : "Image attached" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset input so selecting the same file again still fires onChange.
      e.target.value = "";
    }
  }

  function removeImage() {
    setUploadedMediaUrl(null);
    setUploadedMediaType(null);
  }

  async function generateAiImage() {
    if (!editedContent.trim()) {
      toast({ title: "Write the post first", description: "The post text becomes the image prompt.", variant: "destructive" });
      return;
    }
    setGenImageLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // generate-cover-image takes a topic-style prompt + optional context.
      // For social posts we feed the whole content (capped to 800 chars so
      // the model isn't drowned). It returns { image_url } pointing at a
      // public file in article-covers/covers/.
      const firstLine = editedContent.split("\n").find((l) => l.trim()) || editedContent;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-cover-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ prompt: firstLine.trim().slice(0, 200), context: editedContent.slice(0, 800) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const url = data.image_url || data.url || data.publicUrl;
      if (!url) throw new Error("No image URL returned");
      setUploadedMediaUrl(url);
      setUploadedMediaType("image");
      toast({ title: "Image generated" });
    } catch (e: any) {
      toast({ title: "Image generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenImageLoading(false);
    }
  }

  async function triggerAiVideo() {
    if (!editedContent.trim()) {
      toast({ title: "Write the post first", description: "The post text becomes the video's spoken script seed.", variant: "destructive" });
      return;
    }
    if (!aiVideoTemplate.trim()) {
      toast({ title: "HeyGen template ID required", variant: "destructive" });
      return;
    }
    setAiVideoStarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/trigger-skillstudio-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          topic: editedContent.slice(0, 1500),
          heygenTemplateId: aiVideoTemplate.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      toast({
        title: "Video generation started",
        description: "Skill Studio AI is rendering. Takes 2–5 min. Come back and Refresh the post to attach the video URL.",
      });
      // DO NOT auto-close — closing shifts focus and can trigger the primary
      // action button (Post / Schedule). User dismisses manually via Close.
    } catch (e: any) {
      toast({ title: "Could not start video generation", description: e.message, variant: "destructive" });
    } finally {
      setAiVideoStarting(false);
    }
  }

  if (!open) return null;

  const meta = PLATFORM_META[platform] || PLATFORM_META.linkedin;
  const isLinkedIn = platform === "linkedin";
  const charCount = editedContent.length;
  const overLimit = charCount > meta.charLimit;

  // Saves edits to an existing post without publishing or rescheduling.
  // The only path that should fire when the user is editing — never call
  // postNow / schedulePost for an existing post unless they're explicitly
  // re-publishing.
  async function saveEdits() {
    if (!existingPostId) return;
    try {
      const { error } = await supabase.from("social_posts" as any)
        .update({
          content: editedContent,
          media_url: effectiveMediaUrl,
          media_type: effectiveMediaType,
        })
        .eq("id", existingPostId);
      if (error) throw error;
      toast({ title: "Saved" });
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function postNow() {
    // Hard guardrail: never let this run for an already-saved post. The UI
    // hides the button in edit mode, but we double-check in case of any
    // future regression that surfaces it.
    if (existingPostId) {
      toast({ title: "Use Save / Reschedule for existing posts", variant: "destructive" });
      return;
    }
    const preview = (editedContent || "").slice(0, 120) + (editedContent.length > 120 ? "…" : "");
    const ok = window.confirm(
      `Publish to LinkedIn RIGHT NOW?\n\nThis cannot be undone from ContentLab — you'd have to delete on LinkedIn manually.\n\nPreview:\n"${preview}"\n\nClick OK to publish, Cancel to keep editing.`,
    );
    if (!ok) return;
    if (!isLinkedIn) {
      toast({ title: "Direct posting only supported for LinkedIn currently", description: "For other platforms, copy the content and post manually." });
      return;
    }
    if (!editedContent.trim()) {
      toast({ title: "Post is empty", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in — refresh and try again");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          content: editedContent,
          article_url: articleUrl,
          media_url: effectiveMediaUrl,
          media_type: effectiveMediaType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");

      // Library record. user_id is required for RLS; topic is NOT NULL so
      // we always pass a fallback derived from the content.
      const fallbackTopic = topic || articleTitle || editedContent.trim().slice(0, 80) || "manual";
      const { error: insErr } = await supabase.from("social_posts" as any).insert({
        user_id: user.id,
        platform, content: editedContent, topic: fallbackTopic,
        title: articleTitle || fallbackTopic, article_id: articleId || null,
        article_title: articleTitle || null, status: "posted",
        posted_at: new Date().toISOString(), posted_url: data.post_url || null,
        media_url: effectiveMediaUrl, media_type: effectiveMediaType,
      });
      if (insErr) {
        // The post IS live on LinkedIn — say so honestly instead of "Post failed".
        toast({
          title: "Posted to LinkedIn (library record failed)",
          description: `Live at ${data.post_url || "LinkedIn"}. Library insert error: ${insErr.message}`,
          variant: "destructive",
        });
        setPosting(false);
        return;
      }

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
      if (!user) throw new Error("Not signed in");
      const newScheduledAt = new Date(scheduleDate).toISOString();

      if (existingPostId) {
        // Reschedule path: update the existing row in place so its id,
        // article_id, and history stay intact. Also reset status to
        // 'scheduled' in case the user is re-queuing a previously failed
        // post.
        const { error } = await supabase.from("social_posts" as any)
          .update({
            content: editedContent,
            scheduled_at: newScheduledAt,
            status: "scheduled",
            error_message: null,
            media_url: effectiveMediaUrl,
            media_type: effectiveMediaType,
          })
          .eq("id", existingPostId);
        if (error) throw error;
        setScheduled(true);
        toast({ title: "✓ Post rescheduled!", description: `Will be sent ${new Date(scheduleDate).toLocaleString()}` });
      } else {
        const fallbackTopic = topic || articleTitle || editedContent.trim().slice(0, 80) || "manual";
        const { error } = await supabase.from("social_posts" as any).insert({
          user_id: user.id, platform, content: editedContent,
          topic: fallbackTopic, title: articleTitle || fallbackTopic,
          article_id: articleId || null, article_title: articleTitle || null,
          scheduled_at: newScheduledAt, status: "scheduled",
          media_url: effectiveMediaUrl, media_type: effectiveMediaType,
        });
        if (error) throw error;
        setScheduled(true);
        toast({ title: "✓ Post scheduled!", description: `Will be sent ${new Date(scheduleDate).toLocaleString()}` });
      }
      onSaved?.();
    } catch (e: any) {
      console.error("Schedule post failed:", e);
      toast({ title: existingPostId ? "Reschedule failed" : "Schedule failed", description: e.message || "Unknown error — check console", variant: "destructive" });
    }
    setScheduling(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center text-white`}>{meta.icon}</div>
            <span className="font-semibold text-sm">{meta.label} Post</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setTab("preview")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Preview</button>
            <button type="button" onClick={() => setTab("schedule")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Schedule</button>
            <button type="button" onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          {tab === "preview" ? (
            <div className="p-5 space-y-3">
              {/* Collapsible preview */}
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >
                <span>Preview how this will look on {meta.label}</span>
                {previewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {previewOpen && (
                <div className="border border-border rounded-xl overflow-hidden bg-white">
                  <div className={`h-1.5 ${meta.bg}`} />
                  <div className="p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">You</div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Your Name</p>
                        <p className="text-[10px] text-muted-foreground">{meta.label} · Just now</p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{editedContent}</p>
                    {effectiveMediaUrl && (
                      <div className="mt-3 rounded-lg overflow-hidden border border-border">
                        {effectiveMediaType === "video" ? (
                          <video src={effectiveMediaUrl} controls className="w-full max-h-64 object-cover" />
                        ) : (
                          <img src={effectiveMediaUrl} alt="media" className="w-full max-h-64 object-cover" />
                        )}
                      </div>
                    )}
                    {articleUrl && isLinkedIn && (
                      <div className="mt-3 border border-border rounded-lg p-3 flex items-center gap-2 bg-muted/30">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{articleTitle || articleUrl}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Editable content */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-foreground">Edit post content</label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {uploading ? "Uploading…" : effectiveMediaUrl ? `Replace ${effectiveMediaType === "video" ? "video" : "image"}` : "Add image / video"}
                      <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleFileSelect} disabled={uploading} />
                    </label>
                    <button
                      type="button"
                      onClick={generateAiImage}
                      disabled={genImageLoading}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                      title="Generate an AI image from this post text"
                    >
                      {genImageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {genImageLoading ? "Generating…" : "Generate AI image"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiVideoOpen((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      title="Generate a HeyGen avatar video from this post text via Skill Studio AI"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Generate AI video
                    </button>
                    {effectiveMediaUrl && (
                      <button
                        type="button"
                        onClick={removeImage}
                        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                  rows={previewOpen ? 10 : 16}
                  placeholder={`Write your ${meta.label} post…`}
                  className="w-full text-sm border border-border rounded-lg p-3 bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed min-h-[200px]"
                />
                <p className={`text-xs mt-1 text-right ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {charCount.toLocaleString()} / {meta.charLimit.toLocaleString()}
                </p>
              </div>

              {aiVideoOpen && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Generate AI video with Skill Studio
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Your post text becomes the spoken script. HeyGen renders an avatar video. Takes 2–5 min, billed to the Skill Studio AI account configured by your admin.
                  </p>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">HeyGen template ID</label>
                    <input
                      value={aiVideoTemplate}
                      onChange={(e) => setAiVideoTemplate(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); triggerAiVideo(); } }}
                      placeholder="e.g. 4f3...e9c"
                      className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Find IDs in Skill Studio AI → HeyGen Templates. We'll let you pick from a dropdown once the template list endpoint is wired.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={triggerAiVideo}
                      disabled={aiVideoStarting || !aiVideoTemplate.trim()}
                      className="text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 disabled:opacity-50"
                    >
                      {aiVideoStarting ? <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Starting…</> : "Start generation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiVideoOpen(false)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
              {isReschedule ? (
                <>
                  {/* EDIT MODE: never offer Post Now — only Save edits + Reschedule.
                      Prevents the Enter-key / focus-shift class of bugs that
                      caused unapproved posts to fire. */}
                  <button type="button" onClick={() => setTab("schedule")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                    <Calendar className="h-4 w-4" /> Reschedule
                  </button>
                  <button type="button" onClick={saveEdits}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
                    <Check className="h-4 w-4" /> Save changes
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setTab("schedule")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                    <Calendar className="h-4 w-4" /> Schedule
                  </button>
                  {isLinkedIn ? (
                    <button type="button" onClick={postNow} disabled={posting || posted || overLimit}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${posted ? "bg-green-500 text-white" : "bg-[#0A66C2] hover:bg-[#004182] text-white"}`}>
                      {posted ? <Check className="h-4 w-4" /> : posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {posted ? "Posted!" : "Post to LinkedIn"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => { navigator.clipboard.writeText(editedContent); toast({ title: "Copied!" }); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                      Copy to Clipboard
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => setTab("preview")} className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Back
              </button>
              <button type="button" onClick={schedulePost} disabled={scheduling || scheduled || !scheduleDate}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${scheduled ? "bg-green-500 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
                {scheduled ? <Check className="h-4 w-4" /> : scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {scheduled ? (isReschedule ? "Rescheduled!" : "Scheduled!") : (isReschedule ? "Reschedule Post" : "Schedule Post")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
