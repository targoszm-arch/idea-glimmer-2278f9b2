import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PenSquare, Filter, Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import ArticleCard from "@/components/ArticleCard";
import { supabase, type Article } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "automation">("all");
  const [syncing, setSyncing] = useState(false);
  const location = useLocation();

  const handleSyncFramer = async () => {
    setSyncing(true);
    try {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, wp_permalink, source, automation_name")
        .eq("status", "published");

      if (error) throw error;
      if (!articles?.length) {
        toast({ title: "No published articles", description: "Publish some articles first." });
        setSyncing(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      let synced = 0;
      let failed = 0;
      for (const article of articles) {
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-framer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              article_id: article.id,
              title: article.title,
              slug: article.slug,
              content: article.content,
              excerpt: article.excerpt,
              meta_description: article.meta_description,
              category: article.category,
              cover_image_url: article.cover_image_url,
              framer_item_id: (article as any).framer_item_id ?? null,
            }),
          });
          const data = await res.json();
          // If plugin-managed, stop the loop and inform user
          if (data.error === "plugin_managed") {
            toast({ 
              title: "Framer syncs via plugin", 
              description: "Your Framer integration uses the plugin. Open Framer and click Sync in the ContentLab plugin."
            });
            setSyncing(false);
            return;
          }
          if (res.ok) synced++;
          else failed++;
        } catch { failed++; }
      }

      toast({
        title: `Synced ${synced} article${synced !== 1 ? "s" : ""} to Framer`,
        description: failed > 0 ? `${failed} failed — check Supabase logs.` : "All articles synced successfully.",
      });
    } catch (err: any) {
      toast({ title: "Framer sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [location.key]);

  const fetchArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase.
    from("articles").
    select("*").
    order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading articles", description: error.message, variant: "destructive" });
    } else {
      setArticles((data || []) as Article[]);
    }
    setLoading(false);
  };

  const filtered = statusFilter === "all" ? articles
    : statusFilter === "automation" ? articles.filter((a) => (a as any).source === "automation")
    : articles.filter((a) => a.status === statusFilter);

  return (
    <PageLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          
          <div>
            <h1 className="text-3xl font-bold text-foreground">Content Library</h1>
            <p className="mt-1 text-muted-foreground">
              {articles.length} article{articles.length !== 1 ? "s" : ""} in your library
            </p>
          </div>
          <div className="flex items-center gap-2">
<Link
              to="/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
              <PenSquare className="h-4 w-4" />
              New Article
            </Link>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "published", "draft", "automation"] as const).map((s) =>
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === s ?
            "bg-primary text-primary-foreground" :
            "bg-secondary text-muted-foreground hover:text-foreground"}`
            }>
            
              {s === "automation" ? "⚡ Auto" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          )}
        </div>

        {loading ?
        <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div> :
        filtered.length === 0 ?
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          
            <PenSquare className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h2 className="mb-2 text-lg font-semibold text-foreground">No articles yet</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Create your first AI-generated article to get started.
            </p>
            <Link
            to="/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
            
              <PenSquare className="h-4 w-4" />
              Create Article
            </Link>
          </motion.div> :

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          
            {filtered.map((article, i) =>
          <motion.div
            key={article.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}>
            
                <ArticleCard article={article} />
              </motion.div>
          )}
          </motion.div>
        }
    </PageLayout>
  );
};

export default Dashboard;
