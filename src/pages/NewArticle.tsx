import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Save, Sparkles, Loader2, ArrowLeft, Settings, ImagePlus, X } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { TONE_PRESETS } from "@/lib/tones";
import { streamAI } from "@/lib/ai-stream";
import { toast } from "@/hooks/use-toast";

const NewArticle = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillTopic = searchParams.get("topic") || "";

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState(prefillTopic);
  const [tone, setTone] = useState("informative");
  const [category, setCategory] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedMetaDescription, setGeneratedMetaDescription] = useState("");

  // AI Settings from knowledge base
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
    StarterKit,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: "Start writing or generate with AI..." })],

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

        editor?.commands.setContent(accumulated);
      },
      onDone: () => {
        const metaDescMatch = accumulated.match(/<!--\s*META_DESCRIPTION:\s*(.*?)\s*-->/i)
          || accumulated.match(/\/\/\s*META_DESCRIPTION:\s*(.+)/i);
        if (metaDescMatch?.[1]) {
          setGeneratedMetaDescription(metaDescMatch[1].trim());
        }

        const cleanContent = accumulated
          .replace(/<!--\s*META_TITLE:.*?-->/gi, "")
          .replace(/<!--\s*META_DESCRIPTION:.*?-->/gi, "")
          .replace(/\/\/\s*META_TITLE:.*$/gim, "")
          .replace(/\/\/\s*META_DESCRIPTION:.*$/gim, "")
          .trim();

        if (cleanContent) {
          editor?.commands.setContent(cleanContent);
        }

        setIsGenerating(false);
        toast({ title: "Article generated!", description: "Review and edit the content, then save." });
      },
      onError: (error) => {
        setIsGenerating(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      }
    });
  }, [aiSettings, category, editor, title, topic, tone]);

  const handleGenerateCoverImage = async () => {
    const imagePrompt = topic.trim() || title.trim();
    if (!imagePrompt) {
      toast({ title: "Enter a topic or title first", variant: "destructive" });
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
          body: JSON.stringify({ prompt: imagePrompt })
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

      const content = editor?.getHTML() || "";
      const excerpt = editor?.getText().slice(0, 200) || "";
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const { data, error } = await supabase
        .from("articles")
        .insert({
          title,
          slug,
          content,
          excerpt,
          meta_description: generatedMetaDescription.trim() || excerpt,
          category,
          status,
          cover_image_url: coverImageUrl
        })
        .select()
        .single();

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
        toast({
          title: "Article published!",
          description: "Open your Framer plugin and click 'Sync' to push it to Framer CMS."
        });
      } else {
        toast({ title: "Saved as draft!" });
      }

      navigate(status === "published" ? `/article/${data.id}` : "/");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-[5px] px-[5px]">
      <Header />
      <main className="container py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => navigate("/")} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>

          {/* Generation Form */}
          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Article Generator
            </h2>
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Marketing"
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
                {coverImageUrl ?
                <div className="relative overflow-hidden rounded-xl border border-border">
                    <img src={coverImageUrl} alt="Cover" className="h-48 w-full object-cover" />
                    <button
                    onClick={() => setCoverImageUrl(null)}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground backdrop-blur-sm hover:bg-background">
                    
                      <X className="h-4 w-4" />
                    </button>
                    <button
                    onClick={handleGenerateCoverImage}
                    disabled={isGeneratingImage}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background disabled:opacity-50">
                    
                      {isGeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                      Regenerate
                    </button>
                  </div> :

                <button
                  onClick={handleGenerateCoverImage}
                  disabled={isGeneratingImage}
                  className="flex h-32 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
                  
                    {isGeneratingImage ?
                  <><Loader2 className="h-5 w-5 animate-spin" /> Generating cover image...</> :

                  <><ImagePlus className="h-5 w-5" /> Generate AI Cover Image</>
                  }
                  </button>
                }
              </div>

              <div className="mb-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Article Title"
                  className="w-full border-none bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
                
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <EditorToolbar editor={editor} />
                <EditorContent editor={editor} />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => handleSave("draft")}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
                  
                  <Save className="h-4 w-4" />
                  Save Draft
                </button>
                <button
                  onClick={() => handleSave("published")}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50">
                  
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Publish
                </button>
                <button
                  onClick={() => setShowAssistant(!showAssistant)}
                  className={`ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  showAssistant ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`
                  }>
                  
                  <Sparkles className="h-4 w-4" />
                  AI Assistant
                </button>
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
      </main>
    </div>);

};

export default NewArticle;