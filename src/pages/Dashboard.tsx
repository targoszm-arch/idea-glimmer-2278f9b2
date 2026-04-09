import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { PenSquare, Filter, Loader2, RefreshCw, Search, X } from "lucide-react";
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const location = useLocation();

  const handleSyncFramer = async () => {
    setSyncing(true);
    try {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, slug, content, excerpt, meta_description, category, cover_image_url, created_at, source, automation_name")
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

  const categories = useMemo(() => {
    const cats = articles.map((a) => a.category).filter(Boolean);
    return [...new Set(cats)].sort();
  }, [articles]);

  const filtered = useMemo(() => {
    let result = articles;

    // Status filter
    if (statusFilter === "automation") {
      result = result.filter((a) => (a as any).source === "automation");
    } else if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter((a) => a.category === categoryFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.excerpt?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [articles, statusFilter, categoryFilter, searchQuery]);

  return (
    <PageLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h1 className="text-3xl font-bold text-foreground">Content Library</h1>
            <p className="mt-1 text-muted-foreground">
              {filtered.length} of {articles.length} article{articles.length !== 1 ? "s" : ""} in your library
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

        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search articles by title, excerpt, or category…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
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

          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Category:</span>
              <button
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  categoryFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
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
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              {articles.length === 0 ? "No articles yet" : "No matching articles"}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {articles.length === 0
                ? "Create your first AI-generated article to get started."
                : "Try adjusting your search or filters."}
            </p>
            {articles.length === 0 ? (
              <Link
                to="/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <PenSquare className="h-4 w-4" />
                Create Article
              </Link>
            ) : (
              <button
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); setCategoryFilter("all"); }}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/80">
                Clear Filters
              </button>
            )}
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
