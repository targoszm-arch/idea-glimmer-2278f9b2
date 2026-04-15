import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { Save, Sparkles, Loader2, ArrowLeft, Trash2, ImagePlus, X, Upload, ChevronDown, Send, Mail, Share2, BookmarkPlus, Check } from "lucide-react";
import { ArticleSocialPanel } from "@/components/ArticleSocialPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";
import PlatformLogo from "@/components/PlatformLogo";
import RelatedArticlesPicker from "@/components/RelatedArticlesPicker";
import { toSlug, buildUrlPath } from "@/lib/slug";
import { saveImageToLibrary } from "@/lib/imageLibrary";
import DOMPurify from "dompurify";
import { MediaLibraryPicker } from "../components/MediaLibraryPicker";
import { UnsplashPicker } from "../components/UnsplashPicker";
import { CanvaDesignPicker } from "@/components/CanvaDesignPicker";
import { NewsletterEditor } from "@/components/NewsletterEditor";
import { ImageLibraryPicker } from "@/components/ImageLibraryPicker";


const EditArticle = () => {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverSavedToLibrary, setCoverSavedToLibrary] = useState(false);
  const [isSavingCoverToLibrary, setIsSavingCoverToLibrary] = useState(false);
  const [framerItemId, setFramerItemId] = useState<string | null>(null);
  const [intercomArticleId, setIntercomArticleId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showCanvaPicker, setShowCanvaPicker] = useState(false);
  const [showNewsletter, setShowNewsletter] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);
  const [isSyncingIntercom, setIsSyncingIntercom] = useState(false);
  const [intercomCollections, setIntercomCollections] = useState<{ id: string; name: string }[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isSyncingFramer, setIsSyncingFramer] = useState(false);
  const [isSyncingWordPress, setIsSyncingWordPress] = useState(false);
  const [wpPermalink, setWpPermalink] = useState<string | null>(null);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [isSyncingShopify, setIsSyncingShopify] = useState(false);
  const [notionPageId, setNotionPageId] = useState<string | null>(null);
  const [shopifyArticleId, setShopifyArticleId] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [notionDatabases, setNotionDatabases] = useState<{id: string; name: string}[]>([]);
  const [shopifyBlogs, setShopifyBlogs] = useState<{id: string; name: string}[]>([]);
  const [selectedNotionDb, setSelectedNotionDb] = useState("");
  const [selectedShopifyBlog, setSelectedShopifyBlog] = useState("");
  const [showPlatformPicker, setShowPlatformPicker] = useState<"notion" | "shopify" | "intercom" | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [relatedArticleIds, setRelatedArticleIds] = useState<string[]>([]);
  const [contentType, setContentType] = useState<"blog" | "user_guide" | "how_to">("blog");
  const [metaDescription, setMetaDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const { credits, loading: creditsLoading, hasEnough, deductLocally } = useCredits();

  const editor = useEditor({
    extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: "Start writing..." }),
    Image.configure({ inline: false, allowBase64: false }),
    Youtube.configure({ width: 840, height: 480 }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader],

    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[400px] px-6 py-4"
      }
    }
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("articles").select("*").eq("id", id).single();
      if (error || !data) {
        toast({ title: "Article not found", variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      setTitle(data.title);
      setCategory(data.category || "");
      setStatus(data.status as "draft" | "published");
      setWpPermalink((data as any).wp_permalink || null);
      setCoverImageUrl(data.cover_image_url || null);
      setFramerItemId((data as any).framer_item_id || null);
      setIntercomArticleId((data as any).intercom_article_id || null);
      setNotionPageId((data as any).notion_page_id || null);
      setShopifyArticleId((data as any).shopify_article_id || null);
      setAuthorName((data as any).author_name || "");
      setRelatedArticleIds((data as any).related_article_ids || []);
      setContentType(((data as any).content_type as any) || "blog");
      setMetaDescription(data.meta_description || "");
      // Strip any markdown fences or preamble before first HTML tag
      let articleContent = data.content || "";
      const firstTag = articleContent.indexOf("<");
      if (firstTag > 0) articleContent = articleContent.slice(firstTag);
      editor?.commands.setContent(articleContent);
      setLoading(false);
    })();
  }, [id, editor]);

  const handleSave = async (newStatus?: "draft" | "published") => {
    setIsSaving(true);

    try {
      if (!id) {
        toast({ title: "Missing article id", variant: "destructive" });
        return;
      }

      const content = (editor?.getHTML() || "").replace(/\s*style="[^"]*"/gi, "");
      const plainText = editor?.getText() || "";
      const excerpt = plainText.slice(0, 200);
      const slug = toSlug(title, 80);
      const url_path = buildUrlPath({ title, contentType, category, existingSlug: slug });
      const finalStatus = newStatus || status;

      const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
      const reading_time_minutes = Math.max(1, Math.ceil(wordCount / 200));

      const faqMatch = content.match(/(<h2[^>]*>(?:[^<]*FAQ[^<]*)<\/h2>[\s\S]*)/i);
      const faq_html = faqMatch ? faqMatch[1] : "";

      const baseUpdate = {
        title,
        slug,
        url_path,
        content_type: contentType,
        content,
        excerpt,
        meta_description: metaDescription.trim().slice(0, 150),
        category,
        status: finalStatus,
        cover_image_url: coverImageUrl,
        author_name: authorName.trim(),
        reading_time_minutes,
        faq_html,
        updated_at: new Date().toISOString()
      } as any;

      // Try to save with related_article_ids. If the column doesn't exist yet
      // (migrations not applied), fall back to saving without the new fields
      // so the user can still edit articles.
      let attempt = { ...baseUpdate, related_article_ids: relatedArticleIds } as any;
      let { error } = await supabase.from("articles").update(attempt).eq("id", id);

      // Retry removing columns that don't exist yet, one at a time.
      const missingColumns = ["url_path", "content_type", "related_article_ids"];
      for (const col of missingColumns) {
        if (error && new RegExp(col, "i").test(error.message || "")) {
          console.warn(`${col} column missing — run its migration. Falling back.`);
          delete attempt[col];
          ({ error } = await supabase.from("articles").update(attempt).eq("id", id));
        }
      }

      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }

      setStatus(finalStatus);

      if (finalStatus === "published") {
        toast({
          title: "Article published!",
          description: "Use the Publish to menu to distribute to Framer and other platforms."
        });
      } else {
        toast({ title: "Article saved!" });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this article? This cannot be undone.")) return;

    // Build the slug from current title (same logic as save)
    const articleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Attempt Framer CMS cleanup
    if (framerItemId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-from-framer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ framer_item_id: framerItemId, slug: articleSlug }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            throw new Error(data.error || "Framer delete failed");
          }
        }
      } catch (e: any) {
        toast({
          title: "Framer cleanup failed",
          description: `The article was removed from ContentLab but may still exist in Framer CMS. Open the ContentLab plugin in Framer and sync to remove it. Error: ${e.message}`,
          variant: "destructive"
        });
        // Still proceed with deleting from ContentLab
      }
    }

    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Article deleted" });
      navigate("/", { replace: true });
    }
  };

  const handleSaveCoverToLibrary = async () => {
    if (!coverImageUrl) return;
    setIsSavingCoverToLibrary(true);
    const source: "ai_generated" | "upload" | "unsplash" =
      coverImageUrl.includes("/article-covers/")
        ? "ai_generated"
        : coverImageUrl.includes("unsplash.com")
        ? "unsplash"
        : "upload";
    const result = await saveImageToLibrary({
      imageUrl: coverImageUrl,
      title: title?.trim() || "Cover image",
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
    const imagePrompt = metaDescription.trim() || title.trim();
    if (!imagePrompt) {
      toast({ title: "Enter a title first", variant: "destructive" });
      return;
    }
    if (!creditsLoading && !hasEnough("generate_cover_image")) {
      setShowCreditsDialog(true);
      return;
    }
    setIsGeneratingImage(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: imagePrompt })
      });
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

      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-article-cover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          file_base64: base64,
          file_name: file.name,
          content_type: file.type
        })
      });
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

  // Load which platforms the user has connected
  useEffect(() => {
    supabase.from("user_integrations" as any).select("platform").then(({ data }) => {
      setConnectedPlatforms((data || []).map((d: any) => d.platform));
    });
  }, []);

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  };

  const handleSyncToFramer = async () => {
    if (!id) return;
    await handleSave();
    setIsSyncingFramer(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-framer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          article_id: id,
          title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          framer_item_id: framerItemId ?? null,
        }),
      });
      const data = await res.json();
      // Handle plugin-managed mode gracefully
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

  const handleSyncToNotion = async (databaseId?: string) => {
    if (!id) return;
    const dbId = databaseId || selectedNotionDb;
    if (!dbId) {
      // Fetch databases first
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-notion`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ list_databases: true }),
      });
      const data = await res.json();
      if (res.ok) { setNotionDatabases(data.databases || []); setShowPlatformPicker("notion"); }
      else toast({ title: "Failed to load Notion databases", description: data.error, variant: "destructive" });
      return;
    }
    await handleSave();
    setIsSyncingNotion(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-notion`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: id, database_id: dbId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Notion sync failed");
      setNotionPageId(data.notion_page_id);
      setShowPlatformPicker(null);
      toast({ title: `Article ${data.action} in Notion!`, description: `${data.blocks_synced} blocks synced.` });
    } catch (e: any) {
      toast({ title: "Notion sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingNotion(false);
  };

  const handleSyncToShopify = async (blogId?: string) => {
    if (!id) return;
    const bId = blogId || selectedShopifyBlog;
    if (!bId && !shopifyArticleId) {
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-shopify`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ list_blogs: true }),
      });
      const data = await res.json();
      if (res.ok) { setShopifyBlogs(data.blogs || []); setShowPlatformPicker("shopify"); }
      else toast({ title: "Failed to load Shopify blogs", description: data.error, variant: "destructive" });
      return;
    }
    await handleSave();
    setIsSyncingShopify(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-shopify`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ article_id: id, blog_id: bId || selectedShopifyBlog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shopify sync failed");
      setShopifyArticleId(String(data.shopify_article_id));
      setShowPlatformPicker(null);
      toast({ title: `Article ${data.action} in Shopify!` });
    } catch (e: any) {
      toast({ title: "Shopify sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingShopify(false);
  };

  const fetchIntercomCollections = async () => {
    if (intercomCollections.length > 0) return; // already fetched
    setIsLoadingCollections(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-intercom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ list_collections: true })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch collections");
      setIntercomCollections(data.collections || []);
    } catch (e: any) {
      toast({ title: "Failed to load Intercom collections", description: e.message, variant: "destructive" });
    }
    setIsLoadingCollections(false);
  };

  const handleSyncToWordPress = async () => {
    if (!id) return;
    await handleSave();
    setIsSyncingWordPress(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "publish", article_id: id }),
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

  const handleSyncToIntercom = async () => {
    if (!id) return;

    // For new syncs, require a collection selection
    if (!intercomArticleId && !selectedCollectionId) {
      // Fetch collections and let user pick
      await fetchIntercomCollections();
      toast({ title: "Please select an Intercom collection first" });
      return;
    }

    // Save first to ensure latest content is in DB
    await handleSave();

    setIsSyncingIntercom(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const payload: Record<string, unknown> = { article_id: id };
      if (!intercomArticleId && selectedCollectionId) {
        payload.parent_id = selectedCollectionId;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-intercom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Intercom sync failed");

      setIntercomArticleId(String(data.intercom_article_id));
      toast({
        title: `Article ${data.action} in Intercom!`,
        description: `Intercom article ID: ${data.intercom_article_id}`
      });
    } catch (e: any) {
      toast({ title: "Intercom sync failed", description: e.message, variant: "destructive" });
    }
    setIsSyncingIntercom(false);
  };

  if (loading) {
    return (
      <PageLayout hideFooter>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>);

  }

  return (
    <>
    <PageLayout hideFooter>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSave("draft")}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
              
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button
              onClick={() => handleSave("published")}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {status === "published" ? "Save" : "Publish"}
            </button>
            {/* Platform picker modals */}
            {showPlatformPicker === "notion" && notionDatabases.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={selectedNotionDb} onChange={(e) => setSelectedNotionDb(e.target.value)}
                  className="appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm font-medium text-foreground">
                  <option value="">Select Notion database…</option>
                  {notionDatabases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => handleSyncToNotion(selectedNotionDb)} disabled={!selectedNotionDb || isSyncingNotion}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {isSyncingNotion ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sync"}
                </button>
                <button onClick={() => setShowPlatformPicker(null)} className="text-muted-foreground hover:text-foreground text-sm">Cancel</button>
              </div>
            )}
            {showPlatformPicker === "shopify" && shopifyBlogs.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={selectedShopifyBlog} onChange={(e) => setSelectedShopifyBlog(e.target.value)}
                  className="appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm font-medium text-foreground">
                  <option value="">Select Shopify blog…</option>
                  {shopifyBlogs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button onClick={() => handleSyncToShopify(selectedShopifyBlog)} disabled={!selectedShopifyBlog || isSyncingShopify}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {isSyncingShopify ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sync"}
                </button>
                <button onClick={() => setShowPlatformPicker(null)} className="text-muted-foreground hover:text-foreground text-sm">Cancel</button>
              </div>
            )}
            {showPlatformPicker === "intercom" && intercomCollections.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm font-medium text-foreground">
                  <option value="">Select Intercom collection…</option>
                  {intercomCollections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => handleSyncToIntercom()} disabled={!selectedCollectionId || isSyncingIntercom}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {isSyncingIntercom ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sync"}
                </button>
                <button onClick={() => setShowPlatformPicker(null)} className="text-muted-foreground hover:text-foreground text-sm">Cancel</button>
              </div>
            )}
            {/* Publish to dropdown */}
            {!showPlatformPicker && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={!editor?.getText()?.trim() || isSyncingIntercom || isSyncingNotion || isSyncingShopify || isSyncingFramer}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
                    {(isSyncingIntercom || isSyncingNotion || isSyncingShopify || isSyncingFramer)
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                    Publish to
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Distribute article</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSyncToFramer} disabled={isSyncingFramer} className="gap-2 cursor-pointer">
                    <PlatformLogo platform="framer" />
                    {isSyncingFramer ? "Syncing…" : framerItemId ? "Update in Framer" : "Publish to Framer"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Other platforms</DropdownMenuLabel>
                  {connectedPlatforms.includes("notion") ? (
                    <DropdownMenuItem onClick={() => handleSyncToNotion()} className="gap-2 cursor-pointer">
                      <PlatformLogo platform="notion" />
                      {notionPageId ? "Update in Notion" : "Sync to Notion"}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled className="gap-2 opacity-40">
                      <PlatformLogo platform="notion" /> Notion <span className="ml-auto text-xs">Not connected</span>
                    </DropdownMenuItem>
                  )}
                  {connectedPlatforms.includes("shopify") ? (
                    <DropdownMenuItem onClick={() => handleSyncToShopify()} className="gap-2 cursor-pointer">
                      <PlatformLogo platform="shopify" />
                      {shopifyArticleId ? "Update in Shopify" : "Sync to Shopify"}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled className="gap-2 opacity-40">
                      <PlatformLogo platform="shopify" /> Shopify <span className="ml-auto text-xs">Not connected</span>
                    </DropdownMenuItem>
                  )}
                  {connectedPlatforms.includes("intercom") ? (
                    <DropdownMenuItem onClick={() => { if (!intercomArticleId) { fetchIntercomCollections().then(() => setShowPlatformPicker("intercom")); } else { handleSyncToIntercom(); } }} className="gap-2 cursor-pointer">
                      <PlatformLogo platform="intercom" />
                      {intercomArticleId ? "Update in Intercom" : "Sync to Intercom"}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled className="gap-2 opacity-40">
                      <PlatformLogo platform="intercom" /> Intercom <span className="ml-auto text-xs">Not connected</span>
                    </DropdownMenuItem>
                  )}
                  {connectedPlatforms.includes("wordpress") ? (
                    <DropdownMenuItem onClick={handleSyncToWordPress} disabled={isSyncingWordPress} className="gap-2 cursor-pointer">
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
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${showAssistant ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>
              
              <Sparkles className="h-4 w-4" /> AI Assistant
            </button>
            <button
              onClick={() => setShowNewsletter(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
              <Mail className="h-4 w-4" /> Newsletter
            </button>
            <button
              onClick={() => setShowSocial(!showSocial)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${showSocial ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>
              <Share2 className="h-4 w-4" /> Social
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80">
              
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 my-0">
            {/* Cover Image */}
            <div className="mb-4 my-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCoverImage(file);
                  e.target.value = "";
                }} />
              
              {coverImageUrl ?
              <div className="relative overflow-hidden rounded-xl border border-border my-0">
                  <img src={coverImageUrl} alt="Cover" className="h-48 w-fit object-cover" />
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
                    
                      {isGeneratingImage ?
                    <Loader2 className="h-3 w-3 animate-spin" /> :

                    <ImagePlus className="h-3 w-3" />
                    }
                      Regenerate
                    </button>
                    <button
                    onClick={() => setShowUnsplash(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background">
                      <svg className="h-3 w-3" viewBox="0 0 32 32" fill="currentColor"><path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/></svg>
                      Unsplash
                    </button>
                    <button
                      onClick={() => setShowMediaLibrary(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                      Library
                    </button>
                    <button
                      onClick={() => setShowCanvaPicker(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                      Canva
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
                  
                    {isGeneratingImage ?
                  <Loader2 className="h-4 w-4 animate-spin" /> :

                  <ImagePlus className="h-4 w-4" />
                  }
                    Generate AI Cover
                  </button>
                  <button
                    onClick={() => setShowMediaLibrary(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    Media Library
                  </button>
                  <button
                    onClick={() => setShowUnsplash(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor"><path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/></svg>
                    Unsplash
                  </button>
                  <button
                    onClick={() => setShowCanvaPicker(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                    Canva
                  </button>
                </div>
              }
            </div>

            <div className="mb-4 flex flex-wrap gap-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article Title"
                className="flex-1 border-none bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
              
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category"
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Author Name"
                className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm" />

            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-foreground">Meta Description</label>
                <span className={`text-xs ${metaDescription.length > 150 ? "text-destructive" : "text-muted-foreground"}`}>
                  {metaDescription.length} / 150
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown in search results and social shares. Keep it under 150 characters.
              </p>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value.slice(0, 150))}
                placeholder="A short, compelling description of this article…"
                rows={2}
                maxLength={150}
                className={`mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${
                  metaDescription.length > 150
                    ? "border-destructive focus:border-destructive focus:ring-destructive"
                    : "border-border focus:border-primary focus:ring-primary"
                }`}
              />
            </div>

            <RelatedArticlesPicker
              currentArticleId={id ?? null}
              selectedIds={relatedArticleIds}
              onChange={setRelatedArticleIds}
            />

            <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
              {/* Edit / Preview toggle */}
              <div className="flex items-center border-b border-border">
                <button
                  onClick={() => setPreviewMode(false)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${!previewMode ? "text-primary border-b-2 border-primary -mb-px bg-background" : "text-muted-foreground hover:text-foreground"}`}>
                  Edit
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${previewMode ? "text-primary border-b-2 border-primary -mb-px bg-background" : "text-muted-foreground hover:text-foreground"}`}>
                  Preview
                </button>
                <button
                  onClick={() => setShowNewsletter(true)}
                  className="px-4 py-2.5 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Newsletter
                </button>
                {!previewMode && <div className="flex-1"><EditorToolbar editor={editor} onUnsplash={() => setShowUnsplash(true)} /></div>}
              </div>
              {previewMode ? (
                <div className="px-6 py-6 min-h-[400px]">
                  {coverImageUrl && (
                    <img src={coverImageUrl} alt={title} className="w-full h-56 object-cover rounded-xl mb-6" />
                  )}
                  <h1 className="text-3xl font-bold text-foreground mb-4">{title || "Untitled"}</h1>
                  <article
                    className="prose prose-sm sm:prose max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editor?.getHTML() || "", {
                        ALLOWED_TAGS: [
                          "a","b","i","em","strong","p","br","ul","ol","li","h1","h2","h3","h4","h5","h6",
                          "blockquote","code","pre","table","thead","tbody","tr","th","td",
                          "div","span","img","figure","figcaption","hr","sup","sub","s","u",
                        ],
                        ALLOWED_ATTR: ["href","src","alt","title","id","class","target","rel","width","height"],
                      }) }}
                  />
                </div>
              ) : (
                <div className="rounded-b-xl overflow-hidden">
                  <EditorContent editor={editor} />
                </div>
              )}
            </div>
          </div>

          {showAssistant &&
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full lg:w-80">
              <AIAssistantPanel
              currentContent={editor?.getHTML() || ""}
              onApplyContent={(content) => editor?.commands.setContent(content)} />
            
            </motion.div>
          }
          {showSocial && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full lg:w-80 border border-border rounded-xl bg-background flex flex-col overflow-hidden" style={{ minHeight: "520px", maxHeight: "80vh" }}>
              <ArticleSocialPanel
                articleContent={editor?.getHTML() || ""}
                articleTitle={title}
                articleId={id}
                onClose={() => setShowSocial(false)}
              />
            </motion.div>
          )}
        </div>
      </motion.div>
    </PageLayout>
    <OutOfCreditsDialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog} creditsNeeded={CREDIT_COSTS.generate_cover_image} creditsAvailable={credits ?? 0} />
    <CanvaDesignPicker
      open={showCanvaPicker}
      onClose={() => setShowCanvaPicker(false)}
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(true); setShowCanvaPicker(false); }}
    />
    <NewsletterEditor
      open={showNewsletter}
      onClose={() => setShowNewsletter(false)}
      article={{ title, content: editor?.getHTML() || "", excerpt: metaDescription, category, cover_image_url: coverImageUrl, id: id, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") }}
    />
    <ImageLibraryPicker
      open={showImageLibrary}
      onClose={() => setShowImageLibrary(false)}
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(false); setShowImageLibrary(false); }}
    />
    <UnsplashPicker
      open={showUnsplash}
      onClose={() => setShowUnsplash(false)}
      onSelect={(url, _credit) => {
        // If editor is focused/active, insert into editor body; otherwise set as cover
        if (editor && editor.isFocused) {
          editor.chain().focus().setImage({ src: url }).run();
        } else {
          setCoverImageUrl(url);
          setCoverSavedToLibrary(false);
        }
        setShowUnsplash(false);
      }}
    />
    <MediaLibraryPicker
      open={showMediaLibrary}
      onClose={() => setShowMediaLibrary(false)}
      onSelect={(url) => { setCoverImageUrl(url); setCoverSavedToLibrary(true); setShowMediaLibrary(false); }}
    />
    </>);

};

export default EditArticle;