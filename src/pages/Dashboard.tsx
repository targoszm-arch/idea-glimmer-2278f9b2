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
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const location = useLocation();

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

  const filtered = statusFilter === "all" ?
  articles :
  articles.filter((a) => a.status === statusFilter);

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
          <Link
            to="/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
            
            <PenSquare className="h-4 w-4" />
            New Article
          </Link>
        </motion.div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "draft", "published"] as const).map((s) =>
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === s ?
            "bg-primary text-primary-foreground" :
            "bg-secondary text-muted-foreground hover:text-foreground"}`
            }>
            
              {s.charAt(0).toUpperCase() + s.slice(1)}
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
