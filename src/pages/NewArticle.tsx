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
import { Save, Sparkles, Loader2, ArrowLeft, Settings, ImagePlus, X, Upload, MessageSquare, ChevronDown, Send, Share2, BookmarkPlus, Check, Mail } from "lucide-react";
import { ArticleSocialPanel } from "@/components/ArticleSocialPanel";
import { NewsletterEditor } from "@/components/NewsletterEditor";
import CategoryPicker from "@/components/CategoryPicker";
import PlatformLogo from "@/components/PlatformLogo";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { TONE_PRESETS } from "@/lib/tones";
import { streamAI } from "@/lib/ai-stream";
import { toSlug, buildUrlPath } from "@/lib/slug";
import { buildArticleJsonLd, injectJsonLd, type ArticleMeta } from "@/lib/articleJsonLd";
import { saveImageToLibrary } from "@/lib/imageLibrary";
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
  const [contentType, setContentType] = useState<"blog" | "user_guide" | "how_to" | "newsletter">("blog");
  const [isGenerating, setIsGenerating] = useState(false);
  // Blog-only media options. When checked, the article prompt asks the
  // model to emit placeholder HTML comments at chosen positions and
  // matching prompt comments in the metadata tail. After streaming
  // completes we fire the image generators and substitute the placeholders.
  const [includeInlineImage, setIncludeInlineImage] = useState(false);
  const [includeInfographic, setIncludeInfographic] = useState(false);
  // Non-blocking progress for the post-generation asset pipeline (hero is
  // still generated on demand via the "Generate Hero Image" button).
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageAlt, setCoverImageAlt] = useState("Cover image");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [generatedMetaDescription, setGeneratedMetaDescription] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [rssEnabled, setRssEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);
  const [showCanvaPicker, setShowCanvaPicker] = useState(false);
  // Tracks whether the current cover image has already been saved to the
  // library this session so the button flips to a "Saved ✓" state and we
  // don't create duplicate brand_assets rows on a second click.
  const [coverSavedToLibrary, setCoverSavedToLibrary] = useState(false);
  const [isSavingCoverToLibrary, setIsSavingCoverToLibrary] = useState(false);
  const [savedArticleId, setSavedArticleId] = useState<string | null>(null);
  const [showSocial, setShowSocial] = useState(false);
  const [showNewsletter, setShowNewsletter] = useState(false);
  const [framerItemId, setFramerItemId] = useState<string | null>(null);
  const [wpPermalink, setWpPermalink] = useState<string | null>(null);
  const [isSyncingFramer, setIsSyncingFramer] = useState(false);
  const [isSyncingWordPress, setIsSyncingWordPress] = useState(false);
  const [isSyncingIntercom, setIsSyncingIntercom] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [isSyncingShopify, setIsSyncingShopify] = useState(false);
  const [isSyncingMedium, setIsSyncingMedium] = useState(false);
  const [mediumUrl, setMediumUrl] = useState<string | null>(null);
  const [intercomArticleId, setIntercomArticleId] = useState<string | null>(null);
  const [confluencePageId, setConfluencePageId] = useState<string | null>(null);
  const [isSyncingConfluence, setIsSyncingConfluence] = useState(false);
  const [notionPageId, setNotionPageId] = useState<string | null>(null);
  const [shopifyArticleId, setShopifyArticleId] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
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

  // Load connected platforms
  useEffect(() => {
    supabase.from("user_integrations" as any).select("platform").then(({ data }) => {
      setConnectedPlatforms((data || []).map((d: any) => d.platform));
    });
  }, []);

  const handleSyncToIntercom = async () => {
    if (!savedArticleId) return;
    setIsSyncingIntercom(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-intercom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: savedArticleId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Intercom sync failed");
      setIntercomArticleId(String(data.intercom_article_id));
      toast({ title: `Article ${data.action} in Intercom!` });
    } catch (e: any) {
      toast({ title: "Intercom sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingIntercom(false);
  };

  const handleSyncToConfluence = async () => {
    if (!savedArticleId) return;
    setIsSyncingConfluence(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-confluence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: savedArticleId }),
      });
      const data = await resp.json();
      if (data.code === "NEED_SPACE") {
        toast({
          title: "Pick a Confluence space",
          description: "Open the article in the editor (Save first) to pick a space on the first publish.",
          variant: "destructive",
        });
        return;
      }
      if (!resp.ok) throw new Error(data.error || "Confluence sync failed");
      setConfluencePageId(String(data.confluence_page_id));
      toast({ title: `Article ${data.action} in Confluence!` });
    } catch (e: any) {
      toast({ title: "Confluence sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingConfluence(false);
  };

  const handleSyncToNotion = async () => {
    if (!savedArticleId) return;
    setIsSyncingNotion(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: savedArticleId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Notion sync failed");
      setNotionPageId(data.notion_page_id);
      toast({ title: `Article ${data.action} in Notion!` });
    } catch (e: any) {
      toast({ title: "Notion sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingNotion(false);
  };

  const handleSyncToShopify = async () => {
    if (!savedArticleId) return;
    setIsSyncingShopify(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-shopify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: savedArticleId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Shopify sync failed");
      setShopifyArticleId(String(data.shopify_article_id));
      toast({ title: `Article ${data.action} in Shopify!` });
    } catch (e: any) {
      toast({ title: "Shopify sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingShopify(false);
  };

  const editor = useEditor({
    extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
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

    // Media options only take effect for blog content (the edge function
    // also enforces this server-side, but we zero them out here so the
    // post-streaming pipeline doesn't try to parse placeholders that were
    // never going to exist).
    const mediaForBlog = contentType === "blog";
    const wantInlineImage = mediaForBlog && includeInlineImage;
    const wantInfographic = mediaForBlog && includeInfographic;

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
        reference_urls: aiSettings?.reference_urls || [],
        include_inline_image: wantInlineImage,
        include_infographic: wantInfographic,
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
          setGeneratedMetaDescription(metaDescMatch[1].trim().slice(0, 150));
        }

        const altCoverMatch = accumulated.match(/<!--\s*ALT_TEXT_COVER:\s*(.*?)\s*-->/i);
        if (altCoverMatch?.[1]) setCoverImageAlt(altCoverMatch[1].trim());

        const altInlineMatch = accumulated.match(/<!--\s*ALT_TEXT_INLINE:\s*(.*?)\s*-->/i);
        const altInfographicMatch = accumulated.match(/<!--\s*ALT_TEXT_INFOGRAPHIC:\s*(.*?)\s*-->/i);

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
          // Fix troubleshooting: convert plain-text problem titles after <h2>Troubleshooting</h2> into <h3>
          .replace(
            /(<h2[^>]*>Troubleshooting<\/h2>[\s\S]*?)(?:<p>)([^<]{5,80})(<\/p>\s*<p>(?:<strong>)?(?:Cause|Fix|Verify|Check))/gi,
            (_, before, title, after) => `${before}<h3>${title.trim()}</h3>\n<p>${after.replace(/^<\/p>\s*<p>/, "")}`
          )
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

        // Inject FAQPage + BlogPosting JSON-LD from the structured metadata
        // the model emitted (ARTICLE_META_JSON.faq_pairs). Done server-side
        // here rather than asking the model to output <script> tags — JSON
        // syntax was the single biggest source of broken articles.
        let finalContent = cleanContent;
        if (cleanContent) {
          try {
            const parsedMeta: ArticleMeta | undefined = metaJsonMatch?.[1]
              ? JSON.parse(metaJsonMatch[1].trim())
              : undefined;
            const titleMatch = cleanContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            const h1Title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || title || topic;
            const description = metaDescMatch?.[1]?.trim().slice(0, 150) || "";
            const jsonLd = buildArticleJsonLd({
              title: h1Title,
              description,
              articleSection: category || parsedMeta?.primary_focus,
              meta: parsedMeta,
            });
            if (jsonLd) finalContent = injectJsonLd(cleanContent, jsonLd);
          } catch (e) {
            console.warn("JSON-LD build skipped:", e);
          }
          editor?.commands.setContent(finalContent);
        }

        setIsGenerating(false);
        deductLocally("generate_article");
        toast({ title: "Article generated!", description: "Review and edit the content, then save." });

        // Kick off inline media pipeline after streaming completes. The
        // article is already in the editor; we only fetch + substitute
        // asset URLs here. Runs asynchronously so the user can read.
        if (wantInlineImage || wantInfographic) {
          void generateInlineMedia(accumulated, finalContent, {
            wantInlineImage,
            wantInfographic,
            altInline: altInlineMatch?.[1]?.trim(),
            altInfographic: altInfographicMatch?.[1]?.trim(),
          });
        }
      },
      onError: (error) => {
        setIsGenerating(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      }
    });
  }, [aiSettings, category, editor, title, topic, tone, contentType, includeInlineImage, includeInfographic]);

  // Parse the inline-image and infographic prompts from the model's
  // metadata tail and fire the matching edge functions. When an asset
  // returns, replace the body placeholder (<!-- INLINE_IMAGE_HERE -->
  // or <!-- INFOGRAPHIC_HERE -->) with a real <img> tag. The whole thing
  // is best-effort: if one asset fails we keep the article and surface
  // a toast, but never block the user from editing.
  const generateInlineMedia = async (
    rawAccumulated: string,
    _contentWithJsonLd: string,
    opts: { wantInlineImage: boolean; wantInfographic: boolean; altInline?: string; altInfographic?: string },
  ) => {
    setIsGeneratingMedia(true);
    try {
      const inlinePromptMatch = opts.wantInlineImage
        ? rawAccumulated.match(/<!--\s*INLINE_IMAGE_PROMPT:\s*([\s\S]*?)\s*-->/i)
        : null;
      const infoPromptMatch = opts.wantInfographic
        ? rawAccumulated.match(/<!--\s*INFOGRAPHIC_PROMPT:\s*([\s\S]*?)\s*-->/i)
        : null;
      const infoStyleMatch = opts.wantInfographic
        ? rawAccumulated.match(/<!--\s*INFOGRAPHIC_STYLE:\s*(stats|comparison|timeline|process|general)\s*-->/i)
        : null;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const base = import.meta.env.VITE_SUPABASE_URL;
      const contextSnippet = editor?.getText()?.substring(0, 500) || "";

      const inlineReq = inlinePromptMatch?.[1]?.trim()
        ? fetch(`${base}/functions/v1/generate-cover-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ prompt: inlinePromptMatch[1].trim(), context: contextSnippet }),
          })
        : null;
      const infoReq = infoPromptMatch?.[1]?.trim()
        ? fetch(`${base}/functions/v1/generate-infographic`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              prompt: infoPromptMatch[1].trim(),
              style: infoStyleMatch?.[1]?.toLowerCase() || "general",
            }),
          })
        : null;

      const [inlineRes, infoRes] = await Promise.all([
        inlineReq ? inlineReq.then((r) => r.json()).catch((e) => ({ error: String(e) })) : null,
        infoReq ? infoReq.then((r) => r.json()).catch((e) => ({ error: String(e) })) : null,
      ]);

      // Read the CURRENT editor content, not the stale snapshot captured
      // 1-2 minutes ago when generation started. The old approach passed
      // contentWithJsonLd by closure, but by the time images arrive the
      // user may have edited the article — or the captured value could be
      // empty if a race occurred. Reading live ensures we insert into
      // whatever is actually in the editor right now.
      let updated = editor?.getHTML() || "";
      if (updated.length < 50) {
        toast({ title: "Skipped image insertion", description: "Editor content is too short — images were generated but not inserted.", variant: "destructive" });
        setIsGeneratingMedia(false);
        return;
      }
      // Standalone <img>, NOT wrapped in <p>. The TipTap editor configures
      // Image with inline: false, making it a block-level node. Block nodes
      // can't be children of <p> (which only accepts inline content), so
      // TipTap would silently drop <p><img></p> when setContent parses the
      // HTML. Using a bare <img> keeps it at block level and survives the
      // schema validation.
      const INLINE_IMG = (url: string, alt: string) =>
        `<img src="${url}" alt="${alt.replace(/"/g, "&quot;")}" />`;

      // Placeholder-substitute OR fall back to a sensible default position.
      // Perplexity sometimes forgets to emit the *_HERE comment in the body
      // even when it emits the *_PROMPT in the metadata. Rather than silently
      // dropping the generated image (and still charging credits), we insert
      // at a fallback position so the user always sees the asset.
      const insertAtFallback = (html: string, imgTag: string, kind: "inline" | "info"): string => {
        // 1) After the first </h2> block's next </p> — inline image sits
        //    after the first real content section.
        // 2) Before the FAQ section (detected by <h2 id="faqs"> or
        //    "Frequently Asked") — infographic sits near end of main body.
        // 3) Before the last </p> if nothing else matches.
        if (kind === "info") {
          const faqMatch = html.match(/<h2[^>]*id="faqs"[^>]*>|<h2[^>]*>[^<]*Frequently Asked/i);
          if (faqMatch && faqMatch.index !== undefined) {
            return html.slice(0, faqMatch.index) + imgTag + "\n" + html.slice(faqMatch.index);
          }
        }
        // After the first </h2>...</p> sequence (i.e. end of the first content section).
        const firstSection = html.match(/<\/h2>[\s\S]*?<\/p>/i);
        if (firstSection && firstSection.index !== undefined) {
          const insertAt = firstSection.index + firstSection[0].length;
          return html.slice(0, insertAt) + "\n" + imgTag + html.slice(insertAt);
        }
        // Last resort: append at end of article body.
        return html + "\n" + imgTag;
      };

      if (inlineRes?.image_url) {
        const alt = opts.altInline || inlinePromptMatch?.[1]?.trim() || "Article image";
        const imgTag = INLINE_IMG(inlineRes.image_url, alt);
        if (/<!--\s*INLINE_IMAGE_HERE\s*-->/i.test(updated)) {
          updated = updated.replace(/<!--\s*INLINE_IMAGE_HERE\s*-->/i, imgTag);
        } else {
          // Model forgot the placeholder — insert at fallback position.
          updated = insertAtFallback(updated, imgTag, "inline");
        }
        deductLocally("generate_cover_image");
      } else if (opts.wantInlineImage) {
        toast({
          title: "Inline image failed",
          description: inlineRes?.error || "No image returned",
          variant: "destructive",
        });
      }

      if (infoRes?.image_url) {
        const alt = opts.altInfographic || infoPromptMatch?.[1]?.trim() || "Infographic";
        const imgTag = INLINE_IMG(infoRes.image_url, alt);
        if (/<!--\s*INFOGRAPHIC_HERE\s*-->/i.test(updated)) {
          updated = updated.replace(/<!--\s*INFOGRAPHIC_HERE\s*-->/i, imgTag);
        } else {
          // Model forgot the placeholder — insert before the FAQ section.
          updated = insertAtFallback(updated, imgTag, "info");
        }
        deductLocally("generate_infographic");
      } else if (opts.wantInfographic) {
        toast({
          title: "Infographic failed",
          description: infoRes?.error || "No image returned",
          variant: "destructive",
        });
      }

      // Clean up any placeholder that didn't get substituted (edge case:
      // model emitted HERE but asset generation failed).
      updated = updated
        .replace(/<!--\s*INLINE_IMAGE_HERE\s*-->/gi, "")
        .replace(/<!--\s*INFOGRAPHIC_HERE\s*-->/gi, "");

      const currentHtml = editor?.getHTML() || "";
      if (updated !== currentHtml) {
        editor?.commands.setContent(updated);
        toast({ title: "Images added to article" });
      }
    } catch (e: any) {
      toast({
        title: "Media generation failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    }
    setIsGeneratingMedia(false);
  };

  const handleSaveCoverToLibrary = async () => {
    if (!coverImageUrl) return;
    setIsSavingCoverToLibrary(true);
    // Heuristic: if the URL is a Supabase-hosted cover-X path or a data:
    // blob, it was AI-generated or uploaded by us; otherwise it's probably
    // an Unsplash / external URL. We still allow saving either — the user
    // may want a reused Unsplash photo in their library too.
    const source: "ai_generated" | "upload" | "unsplash" =
      coverImageUrl.includes("/article-covers/")
        ? "ai_generated"
        : coverImageUrl.includes("unsplash.com")
        ? "unsplash"
        : "upload";
    const result = await saveImageToLibrary({
      imageUrl: coverImageUrl,
      title: title?.trim() || topic?.trim() || "Cover image",
      source,
    });
    setIsSavingCoverToLibrary(false);
    if (result.ok) {
      setCoverSavedToLibrary(true);
      toast({ title: "Saved to Media Library", description: "Reusable via Media Library picker." });
    } else {
      toast({ title: "Save failed", description: result.error || "Unknown error", variant: "destructive" });
    }
  };

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
      setCoverSavedToLibrary(false); // new image → not yet in library
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
      setCoverSavedToLibrary(false); // new image → not yet in library
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
      const slug = buildUrlPath({ title, contentType, category });
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
      const slug = toSlug(title, 64);
      const url_path = buildUrlPath({ title, contentType, category, existingSlug: slug });

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
        meta_description: generatedMetaDescription.trim().slice(0, 150),
        category,
        content_type: contentType,
        url_path,
        status,
        cover_image_url: coverImageUrl,
        author_name: authorName.trim(),
        reading_time_minutes,
        rss_enabled: rssEnabled,
        ...(articleMeta ? { article_meta: { ...articleMeta, cover_image_alt: coverImageAlt } } : { article_meta: { cover_image_alt: coverImageAlt } }),
        faq_html
      } as any;

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
              {savedArticleId && (
                <button
                  onClick={() => setShowNewsletter(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">
                  <Mail className="h-4 w-4" />
                  Newsletter
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
                      disabled={isSyncingFramer || isSyncingWordPress || isSyncingIntercom || isSyncingNotion || isSyncingShopify || isSyncingConfluence}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
                      {(isSyncingFramer || isSyncingWordPress || isSyncingIntercom || isSyncingNotion || isSyncingShopify || isSyncingConfluence) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Publish to <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Distribute article</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handlePublishToFramer} disabled={isSyncingFramer} className="gap-2 cursor-pointer">
                      <PlatformLogo platform="framer" />
                      {isSyncingFramer ? "Syncing…" : framerItemId ? "Update in Framer" : "Publish to Framer"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Other platforms</DropdownMenuLabel>
                    {connectedPlatforms.includes("notion") ? (
                      <DropdownMenuItem onClick={handleSyncToNotion} disabled={isSyncingNotion} className="gap-2 cursor-pointer">
                        <PlatformLogo platform="notion" />
                        {isSyncingNotion ? "Syncing…" : notionPageId ? "Update in Notion" : "Sync to Notion"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <PlatformLogo platform="notion" /> Notion <span className="ml-auto text-xs">Not connected</span>
                      </DropdownMenuItem>
                    )}
                    {connectedPlatforms.includes("shopify") ? (
                      <DropdownMenuItem onClick={handleSyncToShopify} disabled={isSyncingShopify} className="gap-2 cursor-pointer">
                        <PlatformLogo platform="shopify" />
                        {isSyncingShopify ? "Syncing…" : shopifyArticleId ? "Update in Shopify" : "Sync to Shopify"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <PlatformLogo platform="shopify" /> Shopify <span className="ml-auto text-xs">Not connected</span>
                      </DropdownMenuItem>
                    )}
                    {connectedPlatforms.includes("intercom") ? (
                      <DropdownMenuItem onClick={handleSyncToIntercom} disabled={isSyncingIntercom} className="gap-2 cursor-pointer">
                        <PlatformLogo platform="intercom" />
                        {isSyncingIntercom ? "Syncing…" : intercomArticleId ? "Update in Intercom" : "Sync to Intercom"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <PlatformLogo platform="intercom" /> Intercom <span className="ml-auto text-xs">Not connected</span>
                      </DropdownMenuItem>
                    )}
                    {connectedPlatforms.includes("confluence") ? (
                      <DropdownMenuItem onClick={handleSyncToConfluence} disabled={isSyncingConfluence} className="gap-2 cursor-pointer">
                        <PlatformLogo platform="confluence" />
                        {isSyncingConfluence ? "Syncing…" : confluencePageId ? "Update in Confluence" : "Sync to Confluence"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <PlatformLogo platform="confluence" /> Confluence <span className="ml-auto text-xs">Not connected</span>
                      </DropdownMenuItem>
                    )}
                    {connectedPlatforms.includes("wordpress") ? (
                      <DropdownMenuItem onClick={handlePublishToWordPress} disabled={isSyncingWordPress} className="gap-2 cursor-pointer">
                        <PlatformLogo platform="wordpress" />
                        {isSyncingWordPress ? "Publishing…" : wpPermalink ? "Update in WordPress" : "Publish to WordPress"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <PlatformLogo platform="wordpress" /> WordPress <span className="ml-auto text-xs">Not connected</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.open("/settings/integrations", "_blank")} className="gap-2 cursor-pointer text-xs text-muted-foreground">
                      Manage integrations →
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
                  { key: "newsletter", label: "Newsletter", icon: "📧", desc: "Short-form email newsletter with subject, sections, CTA" },
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
                {contentType === "newsletter" && "Short-form email newsletter — subject line, preview, 3-5 punchy sections, single CTA. Under 400 words."}
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

            {/* Meta Description — editable, max 150 chars */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-foreground">Meta Description</label>
                <span className={`text-xs ${generatedMetaDescription.length > 150 ? "text-destructive" : "text-muted-foreground"}`}>
                  {generatedMetaDescription.length} / 150
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown in search results and social shares. Auto-generated by AI — edit as needed.
              </p>
              <textarea
                value={generatedMetaDescription}
                onChange={(e) => setGeneratedMetaDescription(e.target.value.slice(0, 150))}
                placeholder="A short, compelling description of this article…"
                rows={2}
                maxLength={150}
                className={`mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${
                  generatedMetaDescription.length > 150
                    ? "border-destructive focus-visible:ring-destructive"
                    : "border-input focus-visible:ring-ring"
                }`}
              />
            </div>

            {/* LinkedIn RSS toggle */}
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Publish to LinkedIn RSS</p>
                <p className="text-xs text-muted-foreground">Include this article in your LinkedIn RSS feed</p>
              </div>
              <button
                type="button"
                onClick={() => setRssEnabled(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${rssEnabled ? "bg-primary" : "bg-input"}`}
                role="switch"
                aria-checked={rssEnabled}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${rssEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Media options — blog only. Inline image and infographic
                prompts are emitted by the model in the metadata tail and
                the caller substitutes them into <!-- *_HERE --> placeholder
                comments after generation. */}
            {contentType === "blog" && (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">
                  Also generate for this article
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The AI picks the best position inside the article and writes a prompt tied to the section it sits next to.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={includeInlineImage}
                      onChange={(e) => setIncludeInlineImage(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Inline image <span className="text-xs text-muted-foreground">(+5 credits)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={includeInfographic}
                      onChange={(e) => setIncludeInfographic(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Infographic <span className="text-xs text-muted-foreground">(+5 credits)</span>
                  </label>
                </div>
                {(includeInlineImage || includeInfographic) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    The image and infographic can take up to 2 minutes to generate. Please do not refresh. You will be notified via a toast when the images are added to the article.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating
                ? (contentType === "newsletter" ? "Generating newsletter..." : "Generating...")
                : (contentType === "newsletter" ? "Generate Newsletter" : "Generate Article")}
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
                    <img src={coverImageUrl} alt={coverImageAlt} className="h-48 w-full object-cover" />
                    <button
                    onClick={() => setCoverImageUrl(null)}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground backdrop-blur-sm hover:bg-background">
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <button
                        onClick={handleSaveCoverToLibrary}
                        disabled={isSavingCoverToLibrary || coverSavedToLibrary}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background disabled:opacity-70"
                        title={coverSavedToLibrary ? "Already in Media Library" : "Save to Media Library for reuse"}>
                        {isSavingCoverToLibrary
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : coverSavedToLibrary
                            ? <Check className="h-3 w-3 text-green-600" />
                            : <BookmarkPlus className="h-3 w-3" />}
                        {coverSavedToLibrary ? "Saved" : "Save to Library"}
                      </button>
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
                      Generate Hero Image
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
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(false); setShowUnsplash(false); }}
    />
    <MediaLibraryPicker
      open={showMediaLibrary}
      onClose={() => setShowMediaLibrary(false)}
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(true); setShowMediaLibrary(false); }}
    />
    <CanvaDesignPicker
      open={showCanvaPicker}
      onClose={() => setShowCanvaPicker(false)}
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(true); setShowCanvaPicker(false); }}
    />
    <NewsletterEditor
      open={showNewsletter}
      onClose={() => setShowNewsletter(false)}
      article={{
        title,
        content: editor?.getHTML() || "",
        excerpt: (editor?.getText() || "").slice(0, 200),
        category,
        cover_image_url: coverImageUrl,
        id: savedArticleId || undefined,
      }}
    />
    </>
  );
};

// UpgradeModal is rendered via showUpgrade state
export default NewArticle;
