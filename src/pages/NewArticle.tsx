import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Save, Sparkles, Loader2, ArrowLeft, Settings, ImagePlus, X, Upload, MessageSquare, ChevronDown, Send, Share2 } from "lucide-react";
import { ArticleSocialPanel } from "@/components/ArticleSocialPanel";
import CategoryPicker from "@/components/CategoryPicker";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { TONE_PRESETS } from "@/lib/tones";
import { streamAI } from "@/lib/ai-stream";
import { toast } from "@/hooks/use-toast";
import { MediaLibraryPicker } from "../components/MediaLibraryPicker";
import { UnsplashPicker } from "../components/UnsplashPicker";
import { CanvaDesignPicker } from "../components/CanvaDesignPicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NewArticle = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillTopic = searchParams.get("topic") || "";

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState(prefillTopic);
  const [tone, setTone] = useState("informative");
  const [articleMeta, setArticleMeta] = useState<any>(null);
  const [category, setCategory] = useState("");
  const [contentType, setContentType] = useState<"blog" | "user_guide" | "how_to">("blog");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [generatedMetaDescription, setGeneratedMetaDescription] = useState("");
  const [authorName, setAuthorName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);
  const [showCanvaPicker, setShowCanvaPicker] = useState(false);
  const [savedArticleId, setSavedArticleId] = useState<string | null>(null);
  const [showSocial, setShowSocial] = useState(false);
  const [framerItemId, setFramerItemId] = useState<string | null>(null);
  const [wpPermalink, setWpPermalink] = useState<string | null>(null);
  const [isSyncingFramer, setIsSyncingFramer] = useState(false);
  const [isSyncingWordPress, setIsSyncingWordPress] = useState(false);
  const [isSyncingMedium, setIsSyncingMedium] = useState(false);
  const [mediumUrl, setMediumUrl] = useState<string | null>(null);
  const { credits, loading: creditsLoading, hasEnough, deductLocally } = useCredits();

  const [aiSettings, setAiSettings] = useState<{
    tone_key: string;
    tone_description: string;
    app_description: string;
    app_audience: string;
    reference_urls: string[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("ai_settings").select("*").limit(1).single();
      if (data) {
        setAiSettings(data as any);
        setTone(data.tone_key || "informative");
      }
    })();
  }, []);

  const editor = useEditor({
    extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: "Start writing or generate with AI..." }),
    Image.configure({ inline: false, allowBase64: false }),
    Youtube.configure({ width: 840, height: 480 }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[400px] px-6 py-4"
      }
    }
  });

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      toast({ title: "Enter a topic", description: "Please provide a topic to generate an article.", variant: "destructive" });
      return;
    }
    if (!creditsLoading && !hasEnough("generate_article")) {
      setShowCreditsDialog(true);
      return;
    }

    setIsGenerating(true);
    setGeneratedMetaDescription("");
    editor?.commands.clearContent();
    let accumulated = "";

    const tonePreset = TONE_PRESETS.find((t) => t.key === tone);

    await streamAI({
      functionName: "generate-article",
      body: {
        topic,
        tone: tonePreset?.label || tone,
        tone_description: tonePreset?.description || "",
        category,
        content_type: contentType,
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || []
      },
      onDelta: (text) => {
        accumulated += text;
        const h1Match = accumulated.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match && !title) {
          setTitle(h1Match[1].replace(/<[^>]*>/g, "").trim());
        } else {
          const lines = accumulated.split("\n");
          if (lines[0]?.startsWith("# ") && !title) {
            setTitle(lines[0].replace("# ", "").trim());
          }
        }
        // Strip leading code fences / "html" prefix during streaming
        const live = accumulated
          .replace(/^[\s\n]*```[\s\S]*?\n(?=<)/i, "")  // strip ```...anything up to first < tag
          .replace(/^[\s\n]*```[^\n]*\n?/i, "")         // strip any remaining opening fence
          .replace(/[\s\n]*```[\s\n]*$/i, "")            // strip closing fence
          .replace(/^[\s\n]*html[\s\n]+(?=<)/i, "");
        editor?.commands.setContent(live);
      },
      onDone: () => {
        const metaDescMatch = accumulated.match(/<!--\s*META_DESCRIPTION:\s*(.*?)\s*-->/i)
          || accumulated.match(/\/\/\s*META_DESCRIPTION:\s*(.+)/i);
        if (metaDescMatch?.[1]) {
          setGeneratedMetaDescription(metaDescMatch[1].trim());
        }

        // Extract ARTICLE_META_JSON
        const metaJsonMatch = accumulated.match(/<!--\s*ARTICLE_META_JSON:\s*([\s\S]*?)\s*-->/i);
        if (metaJsonMatch?.[1]) {
          try { setArticleMeta(JSON.parse(metaJsonMatch[1].trim())); } catch {}
        }

        const cleanContent = accumulated
          .replace(/<!--\s*META_TITLE:.*?-->/gi, "")
          .replace(/<!--\s*META_DESCRIPTION:.*?-->/gi, "")
          .replace(/\/\/\s*META_TITLE:.*$/gim, "")
          .replace(/\/\/\s*META_DESCRIPTION:.*$/gim, "")
          .replace(/_?Disclaimer:.*$/gis, "")
          .replace(/<p>\s*<em>Disclaimer:.*?<\/em>\s*<\/p>/gis, "")
          .replace(/<p>\s*_?Disclaimer:.*?<\/p>/gis, "")
          .replace(/\[\d+\]/g, "")
          .replace(/<!--\s*ARTICLE_META_JSON:[\s\S]*?-->/gi, "")
          // Strip function/tool call blocks that Perplexity sometimes outputs
          .replace(/\[user-provided\][\s\S]*?(?=<|\n\n|$)/gi, "")
          .replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/gi, "")
          .replace(/<invoke[\s\S]*?<\/antml:invoke>/gi, "")
          .replace(/```[\w-]*\n[\s\S]*?```/g, "")  // any remaining code blocks
          // Remove inline descriptive links that break article flow
          .replace(/<a\s+href="[^"]*">(?!\[\d+\])([^<]{4,})<\/a>/g, "$1")
          // Strip code fences and stray "html" prefix that Perplexity sometimes adds
          .replace(/^[\s\n]*```[\s\S]*?\n(?=<)/i, "")
          .replace(/^[\s\n]*```[^\n]*\n?/i, "")
          .replace(/[\s\n]*```[\s\n]*$/i, "")
          .replace(/^[\s\n]*html[\s\n]+(?=<)/i, "")
          // Strip any leading <!DOCTYPE html> or <html><head>...</head><body> wrappers
          .replace(/^[\s\S]*?<body[^>]*>/i, "")
          .replace(/<\/body>[\s\S]*$/i, "")
          .replace(/^<!DOCTYPE[^>]*>/i, "")
          .replace(/^<html[^>]*>[\s\S]*?<\/head>/i, "")
          // Strip markdown bold (**text**) that AI sometimes outputs instead of <strong>
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          // Remove standalone bare numbers in any wrapper tag or as text nodes
          .replace(/<p>\s*\d{1,2}\s*<\/p>/g, "")
          .replace(/<div>\s*\d{1,2}\s*<\/div>/g, "")
          .replace(/<span>\s*\d{1,2}\s*<\/span>/g, "")
          // Remove "Step X of N" standalone lines (redundant when headings contain step info)
          .replace(/<p>\s*Step\s+\d+\s+of\s+\d+\s*<\/p>/gi, "")
          .replace(/<div>\s*Step\s+\d+\s+of\s+\d+\s*<\/div>/gi, "")
          // Remove bare numbers that appear as text between tags (e.g. </p>\n2\n<p>)
          .replace(/>(\s*)\d{1,2}(\s*)</g, (match, before, after) => {
            // Only strip if it's truly a standalone number (surrounded by whitespace/newlines)
            if (/^\s*$/.test(before) && /^\s*$/.test(after)) return `>${before}${after}<`;
            return match;
          })
          .trim();

        if (cleanContent) {
          editor?.commands.setContent(cleanContent);
        }

        setIsGenerating(false);
        deductLocally("generate_article");
        toast({ title: "Article generated!", description: "Review and edit the content, then save." });
      },
      onError: (error) => {
        setIsGenerating(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      }
    });
  }, [aiSettings, category, editor, title, topic, tone]);

  const handleGenerateCoverImage = async () => {
    const imagePrompt = generatedMetaDescription.trim() || topic.trim() || title.trim();
    if (!imagePrompt) {
      toast({ title: "Enter a topic or title first", variant: "destructive" });
      return;
    }
    if (!creditsLoading && !hasEnough("generate_cover_image")) {
      setShowCreditsDialog(true);
      return;
    }
    setIsGeneratingImage(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            context: editor?.getText()?.substring(0, 500) || ""
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Image generation failed");
      setCoverImageUrl(data.image_url);
      toast({ title: "Cover image generated!" });
    } catch (e: any) {
      toast({ title: "Image generation failed", description: e.message, variant: "destructive" });
    }
    setIsGeneratingImage(false);
  };

  const handleUploadCoverImage = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-article-cover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            file_base64: base64,
            file_name: file.name,
            content_type: file.type,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Upload failed");
      setCoverImageUrl(data.image_url);
      toast({ title: "Cover image uploaded!" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setIsUploadingImage(false);
  };

  const handlePublishToFramer = async () => {
    if (!savedArticleId) { toast({ title: "Save the article first", variant: "destructive" }); return; }
    // Save first to make sure latest content is in DB
    await handleSave("published");
    setIsSyncingFramer(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 64);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-framer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: savedArticleId, framer_item_id: framerItemId ?? null, slug, title }),
      });
      const data = await res.json();
      if (data.error === "plugin_managed") {
        toast({ title: "Framer syncs via plugin", description: data.message });
        setIsSyncingFramer(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Framer sync failed");
      if (data.framer_item_id) setFramerItemId(data.framer_item_id);
      toast({ title: `Article ${data.action ?? "synced"} in Framer CMS!` });
    } catch (e: any) {
      toast({ title: "Framer sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingFramer(false);
  };

  const handlePublishToWordPress = async () => {
    if (!savedArticleId) { toast({ title: "Save the article first", variant: "destructive" }); return; }
    await handleSave("published");
    setIsSyncingWordPress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "publish", article_id: savedArticleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "WordPress publish failed");
      setWpPermalink(data.wp_permalink);
      toast({ title: "Published to WordPress! ✓", description: data.wp_permalink });
    } catch (e: any) {
      toast({ title: "WordPress publish failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingWordPress(false);
  };

  const handlePublishToMedium = async (publishStatus: "draft" | "public" | "unlisted" = "draft") => {
    if (!savedArticleId) { toast({ title: "Save the article first", variant: "destructive" }); return; }
    await handleSave("published");
    setIsSyncingMedium(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-medium`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ article_id: savedArticleId, publish_status: publishStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Medium publish failed");
      setMediumUrl(data.url);
      toast({ title: publishStatus === "draft" ? "Saved to Medium as draft ✓" : "Published to Medium! ✓", description: data.url });
    } catch (e: any) {
      toast({ title: "Medium publish failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingMedium(false);
  };

  const handleSave = async (status: "draft" | "published") => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please add a title for your article.", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Session expired", description: "Please sign in again to save articles.", variant: "destructive" });
        navigate("/login");
        return;
      }

      const content = (editor?.getHTML() || "").replace(/\s*style="[^"]*"/gi, "");
      const plainText = editor?.getText() || "";
      const excerpt = plainText.slice(0, 200);
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 64).replace(/-+$/, "");

      const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
      const reading_time_minutes = Math.max(1, Math.ceil(wordCount / 200));

      const faqMatch = content.match(/(<h2[^>]*>(?:[^<]*FAQ[^<]*)<\/h2>[\s\S]*)/i);
      const faq_html = faqMatch ? faqMatch[1] : "";

      const payload = {
        user_id: user.id,
        title,
        slug,
        content,
        excerpt,
        meta_description: (generatedMetaDescription.trim() || excerpt).slice(0, 255),
        category,
        status,
        cover_image_url: coverImageUrl,
        author_name: authorName.trim(),
        reading_time_minutes,
        ...(articleMeta ? { article_meta: articleMeta } : {}),
        faq_html
      };

      let data: any;
      let error: any;

      if (savedArticleId) {
        // Already saved — update, don't insert
        const result = await supabase
          .from("articles")
          .update(payload)
          .eq("id", savedArticleId)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // First save — insert
        const result = await supabase
          .from("articles")
          .insert(payload)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        if (error.code === "42501") {
          toast({ title: "Permission error", description: "Please sign in again, then retry saving.", variant: "destructive" });
          navigate("/login");
          return;
        }
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }

      if (status === "published") {
        toast({ title: "Article published!", description: "Use 'Publish to' to push to Framer, WordPress and more." });
      } else {
        toast({ title: "Saved as draft!" });
      }

      setSavedArticleId(data.id);
      if ((data as any).framer_item_id) setFramerItemId((data as any).framer_item_id);
      if ((data as any).wp_permalink) setWpPermalink((data as any).wp_permalink);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    
    <PageLayout hideFooter>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Library
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSave("draft")}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              {savedArticleId && (
                <button
                  onClick={() => setShowSocial(!showSocial)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${showSocial ? "bg-primary/10 text-primary border border-primary/30" : "border border-border bg-secondary text-foreground hover:bg-secondary/80"}`}>
                  <Share2 className="h-4 w-4" />
                  Social
                </button>
              )}
              <button
                onClick={() => handleSave("published")}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savedArticleId ? "Save" : "Publish"}
              </button>
              {savedArticleId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={isSyncingFramer || isSyncingWordPress}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
                      {(isSyncingFramer || isSyncingWordPress) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Publish to <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Publish to platform</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handlePublishToFramer} disabled={isSyncingFramer}>
                      {isSyncingFramer ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      {framerItemId ? "Update in Framer" : "Publish to Framer"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePublishToWordPress} disabled={isSyncingWordPress}>
                      {isSyncingWordPress ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      {wpPermalink ? "Update in WordPress" : "Publish to WordPress"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                onClick={() => setShowAssistant(!showAssistant)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                showAssistant ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`
                }>
                <Sparkles className="h-4 w-4" />
                AI Assistant
              </button>
            </div>
          </div>

          {/* Generation Form */}
          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Article Generator
            </h2>

            {/* Content Type Selector */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-foreground">Content Type</label>
              <div className="flex gap-2">
                {([
                  { key: "blog", label: "Blog Post", icon: "✍️", desc: "SEO article with headings, FAQs, sources" },
                  { key: "user_guide", label: "User Guide", icon: "📋", desc: "Step-by-step numbered instructions with actions" },
                  { key: "how_to", label: "How-To Guide", icon: "🛠️", desc: "Task-focused procedural guide with tips" },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setContentType(t.key)}
                    title={t.desc}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      contentType === t.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {contentType === "blog" && "SEO-optimised article with TL;DR, table of contents, FAQs and sources."}
                {contentType === "user_guide" && "Step-by-step numbered guide with clear actions — like a product walkthrough or knowledge base article."}
                {contentType === "how_to" && "Task-focused guide with prerequisites, numbered steps, tips and troubleshooting."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Topic / Idea</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., How to build a SaaS content strategy"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {TONE_PRESETS.map((t) =>
                  <option key={t.key} value={t.key}>{t.label}</option>
                  )}
                </select>
                <a href="/settings" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <Settings className="h-3 w-3" /> Manage in AI Settings
                </a>
              </div>
              <CategoryPicker value={category} onChange={setCategory} />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Author Name</label>
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="e.g., John Doe"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "Generating..." : "Generate Article"}
            </button>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Editor */}
            <div className="flex-1">
              {/* Cover Image */}
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCoverImage(file);
                    e.target.value = "";
                  }}
                />
                {coverImageUrl ?
                <div className="relative overflow-hidden rounded-xl border border-border">
                    <img src={coverImageUrl} alt="Cover" className="h-48 w-full object-cover" />
                    <button
                    onClick={() => setCoverImageUrl(null)}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground backdrop-blur-sm hover:bg-background">
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background disabled:opacity-50">
                        <Upload className="h-3 w-3" />
                        Replace
                      </button>
                      <button
                        onClick={handleGenerateCoverImage}
                        disabled={isGeneratingImage}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background disabled:opacity-50">
                        {isGeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                        Regenerate
                      </button>
                    </div>
                  </div> :
                <div className="flex h-32 w-full gap-3 items-center justify-center rounded-xl border-2 border-dashed border-border">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
                      {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Upload Image
                    </button>
                    <button
                      onClick={handleGenerateCoverImage}
                      disabled={isGeneratingImage}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
                      {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Generate AI Cover
                    </button>
                    <button
                      onClick={() => setShowUnsplash(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor"><path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/></svg>
                      Unsplash
                    </button>
                    <button
                      onClick={() => setShowMediaLibrary(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                      Media Library
                    </button>
                    <button
                      onClick={() => setShowCanvaPicker(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                      Canva
                    </button>
                  </div>
                }
              </div>

              <div className="mb-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Article Title"
                  className="w-full border-none bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
              </div>

              <div className="rounded-xl border border-border bg-card">
                <EditorToolbar editor={editor} />
                <div className="rounded-b-xl overflow-hidden">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>

            {/* AI Assistant Panel */}
            {showAssistant &&
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full lg:w-80">
                <AIAssistantPanel
                currentContent={editor?.getHTML() || ""}
                onApplyContent={(content) => editor?.commands.setContent(content)} />
              </motion.div>
            }
          </div>
        </motion.div>
    </PageLayout>
    <OutOfCreditsDialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog} creditsNeeded={CREDIT_COSTS.generate_article} creditsAvailable={credits ?? 0} />
    <UnsplashPicker
      open={showUnsplash}
      onClose={() => setShowUnsplash(false)}
      onSelect={(url) => { setCoverImageUrl(url); setShowUnsplash(false); }}
    />
    <MediaLibraryPicker
      open={showMediaLibrary}
      onClose={() => setShowMediaLibrary(false)}
      onSelect={(url) => { setCoverImageUrl(url); setShowMediaLibrary(false); }}
    />
    <CanvaDesignPicker
      open={showCanvaPicker}
      onClose={() => setShowCanvaPicker(false)}
      onSelect={(url) => { setCoverImageUrl(url); setShowCanvaPicker(false); }}
    />
    </>
  );
};

// UpgradeModal is rendered via showUpgrade state
export default NewArticle;
