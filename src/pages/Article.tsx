import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Edit3, Loader2, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { supabase, type Article as ArticleType } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const Article = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ArticleType | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyForFramer = async () => {
    if (!article) return;
    const imageHtml = article.cover_image_url
      ? `<img src="${article.cover_image_url}" alt="${article.title}" style="width:100%;max-height:400px;object-fit:cover;border-radius:8px;margin-bottom:16px;" />`
      : "";
    const html = `<h1>${article.title}</h1>${imageHtml}${article.content}`;
    const plainText = article.title + "\n\n" + article.content.replace(/<[^>]*>/g, "");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      toast({ title: "Copied! Ready to paste into Framer." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(plainText);
      toast({ title: "Copied as plain text." });
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("articles").select("*").eq("id", id).single();
      if (error || !data) {
        toast({ title: "Article not found", variant: "destructive" });
        navigate("/");
        return;
      }
      setArticle(data as ArticleType);
      setLoading(false);
    })();
  }, [id]);

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

  if (!article) return null;

  const date = new Date(article.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container max-w-3xl py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Library
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={handleCopyForFramer}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy for Framer"}
              </button>
              <Link
                to={`/edit/${article.id}`}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
              >
                <Edit3 className="h-4 w-4" />
                Edit
              </Link>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Badge variant={article.status === "published" ? "default" : "secondary"}>
              {article.status}
            </Badge>
            {article.category && (
              <span className="text-sm text-muted-foreground">{article.category}</span>
            )}
          </div>

          <h1 className="mb-4 text-4xl font-bold text-foreground leading-tight">{article.title}</h1>

          <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {date}
          </div>

          {article.cover_image_url && (
            <img
              src={article.cover_image_url}
              alt={article.title}
              className="w-full rounded-lg mb-8 object-cover max-h-96"
            />
          )}

          <article
            className="prose prose-sm sm:prose max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default Article;
