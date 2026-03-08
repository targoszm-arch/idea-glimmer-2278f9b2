import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Save, Sparkles, Loader2, ArrowLeft, Trash2, ImagePlus, X } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import EditorToolbar from "@/components/EditorToolbar";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const EditArticle = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[400px] px-6 py-4",
      },
    },
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
      editor?.commands.setContent(data.content || "");
      setLoading(false);
    })();
  }, [id, editor]);

  const handleSave = async (newStatus?: "draft" | "published") => {
    setIsSaving(true);
    const content = editor?.getHTML() || "";
    const excerpt = editor?.getText().slice(0, 200) || "";
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const finalStatus = newStatus || status;

    const { error } = await supabase.from("articles").update({
      title, slug, content, excerpt, meta_description: excerpt, category, status: finalStatus, updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setStatus(finalStatus);
      toast({ title: "Article saved!" });
    }
    setIsSaving(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Library
            </button>
            <button onClick={handleDelete} className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1">
              <div className="mb-4 flex gap-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Article Title"
                  className="flex-1 border-none bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category"
                  className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <EditorToolbar editor={editor} />
                <EditorContent editor={editor} />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => handleSave("draft")} disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50">
                  <Save className="h-4 w-4" /> Save Draft
                </button>
                <button onClick={() => handleSave("published")} disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Publish
                </button>
                <button onClick={() => setShowAssistant(!showAssistant)}
                  className={`ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${showAssistant ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Sparkles className="h-4 w-4" /> AI Assistant
                </button>
              </div>
            </div>

            {showAssistant && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full lg:w-80">
                <AIAssistantPanel
                  currentContent={editor?.getHTML() || ""}
                  onApplyContent={(content) => editor?.commands.setContent(content)}
                />
              </motion.div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default EditArticle;
