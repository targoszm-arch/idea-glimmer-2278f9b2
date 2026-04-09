import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { PenSquare, Filter, Loader2, RefreshCw, Search, X, ChevronDown, Check } from "lucide-react";
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
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const categoryRef = useRef<HTMLDivElement>(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = articles;

    // Status filter
    if (statusFilter === "automation") {
      result = result.filter((a) => (a as any).source === "automation");
    } else if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    // Category filter (multi-select)
    if (selectedCategories.size > 0) {
      result = result.filter((a) => selectedCategories.has(a.category));
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
  }, [articles, statusFilter, selectedCategories, searchQuery]);

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
        <div className="mb-6 flex items-center gap-3 flex-wrap">
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

          {/* Category multi-select dropdown */}
          {categories.length > 0 && (
            <div className="relative" ref={categoryRef}>
              <button
                onClick={() => setCategoryOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedCategories.size > 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Category
                {selectedCategories.size > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-xs font-semibold">
                    {selectedCategories.size}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
              </button>

              {categoryOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-background shadow-lg">
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    {categories.map((cat) => {
                      const selected = selectedCategories.has(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                            selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedCategories.size > 0 && (
                    <div className="border-t border-border p-1.5">
                      <button
                        onClick={() => { setSelectedCategories(new Set()); setCategoryOpen(false); }}
                        className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        Clear categories
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Active category tags */}
          {selectedCategories.size > 0 && (
            Array.from(selectedCategories).map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {cat}
                <button onClick={() => toggleCategory(cat)} className="hover:text-primary/70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
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
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); setSelectedCategories(new Set()); }}
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
