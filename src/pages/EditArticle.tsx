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
import { Save, Sparkles, Loader2, ArrowLeft, Trash2, ImagePlus, X, Upload, MessageSquare, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const EditArticle = () => {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [framerItemId, setFramerItemId] = useState<string | null>(null);
  const [intercomArticleId, setIntercomArticleId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSyncingIntercom, setIsSyncingIntercom] = useState(false);
  const [intercomCollections, setIntercomCollections] = useState<{ id: string; name: string }[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
    StarterKit,
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
        navigate("/");
        return;
      }
      setTitle(data.title);
      setCategory(data.category || "");
      setStatus(data.status as "draft" | "published");
      setCoverImageUrl(data.cover_image_url || null);
      setFramerItemId((data as any).framer_item_id || null);
      setIntercomArticleId((data as any).intercom_article_id || null);
      setAuthorName((data as any).author_name || "");
      setMetaDescription(data.meta_description || "");
      editor?.commands.setContent(data.content || "");
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

      const content = editor?.getHTML() || "";
      const plainText = editor?.getText() || "";
      const excerpt = plainText.slice(0, 200);
      const slug = title.
      toLowerCase().
      replace(/[^a-z0-9]+/g, "-").
      replace(/(^-|-$)/g, "");
      const finalStatus = newStatus || status;

      const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
      const reading_time_minutes = Math.max(1, Math.ceil(wordCount / 200));

      const faqMatch = content.match(/(<h2[^>]*>(?:[^<]*FAQ[^<]*)<\/h2>[\s\S]*)/i);
      const faq_html = faqMatch ? faqMatch[1] : "";

      const { error } = await supabase.
      from("articles").
      update({
        title,
        slug,
        content,
        excerpt,
        meta_description: excerpt.slice(0, 255),
        category,
        status: finalStatus,
        cover_image_url: coverImageUrl,
        author_name: authorName.trim(),
        reading_time_minutes,
        faq_html,
        updated_at: new Date().toISOString()
      }).
      eq("id", id);

      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }

      setStatus(finalStatus);

      if (finalStatus === "published") {
        toast({
          title: "Article published!",
          description: "Open your Framer plugin and click 'Sync' to push it to Framer CMS."
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
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Article deleted" });
      navigate("/");
    }
  };

  const handleGenerateCoverImage = async () => {
    const imagePrompt = metaDescription.trim() || title.trim();
    if (!imagePrompt) {
      toast({ title: "Enter a title first", variant: "destructive" });
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
      toast({ title: "Cover image uploaded!" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setIsUploadingImage(false);
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
    <PageLayout hideFooter>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
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
              Publish
            </button>
            {/* Intercom collection picker (only for new syncs) */}
            {!intercomArticleId && intercomCollections.length > 0 && (
              <div className="relative">
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm font-medium text-foreground">
                  <option value="">Select collection…</option>
                  {intercomCollections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
            <button
              onClick={handleSyncToIntercom}
              disabled={isSyncingIntercom || isLoadingCollections}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
              
              {isSyncingIntercom || isLoadingCollections ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {intercomArticleId ? "Update in Intercom" : "Sync to Intercom"}
            </button>
            <button
              onClick={() => setShowAssistant(!showAssistant)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${showAssistant ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>
              
              <Sparkles className="h-4 w-4" /> AI Assistant
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

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <EditorToolbar editor={editor} />
              <EditorContent editor={editor} />
            </div>
          </div>

          {showAssistant &&
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full lg:w-80">
              <AIAssistantPanel
              currentContent={editor?.getHTML() || ""}
              onApplyContent={(content) => editor?.commands.setContent(content)} />
            
            </motion.div>
          }
        </div>
      </motion.div>
    </PageLayout>);

};

export default EditArticle;