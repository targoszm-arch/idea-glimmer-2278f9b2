import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ArticleStub = { id: string; title: string; category: string | null };

interface Props {
  currentArticleId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function RelatedArticlesPicker({ currentArticleId, selectedIds, onChange }: Props) {
  const [articles, setArticles] = useState<ArticleStub[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load all articles once when opened
  useEffect(() => {
    if (!open || articles.length > 0) return;
    setLoading(true);
    supabase
      .from("articles")
      .select("id, title, category")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setArticles((data || []) as ArticleStub[]);
        setLoading(false);
      });
  }, [open, articles.length]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const available = useMemo(
    () => articles.filter((a) => a.id !== currentArticleId),
    [articles, currentArticleId]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return available;
    const q = query.toLowerCase();
    return available.filter(
      (a) => a.title?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q)
    );
  }, [available, query]);

  const selectedArticles = useMemo(
    () => articles.filter((a) => selectedIds.includes(a.id)),
    [articles, selectedIds]
  );

  // Fetch titles for any selected IDs we don't have in the local list yet
  useEffect(() => {
    const missing = selectedIds.filter((id) => !articles.some((a) => a.id === id));
    if (missing.length === 0) return;
    supabase
      .from("articles")
      .select("id, title, category")
      .in("id", missing)
      .then(({ data }) => {
        if (data?.length) setArticles((prev) => [...prev, ...((data as ArticleStub[]) ?? [])]);
      });
  }, [selectedIds, articles]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className="mt-4">
      <label className="text-sm font-medium text-foreground">Related Articles</label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Pick articles to show as "related" on this blog post. Syncs to Framer as a multi-reference field.
      </p>

      <div className="relative mt-2" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-secondary/50"
        >
          <span className="text-muted-foreground">
            {selectedIds.length === 0
              ? "Select related articles…"
              : `${selectedIds.length} article${selectedIds.length !== 1 ? "s" : ""} selected`}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-border bg-background shadow-lg">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search articles…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {loading ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {query ? "No matches" : "No other articles yet"}
                </div>
              ) : (
                filtered.map((a) => {
                  const isSel = selectedIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        isSel ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSel ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {isSel && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{a.title || "Untitled"}</span>
                      {a.category && (
                        <span className="text-xs text-muted-foreground">{a.category}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {selectedArticles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedArticles.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              <span className="max-w-[180px] truncate">{a.title}</span>
              <button type="button" onClick={() => remove(a.id)} className="hover:text-primary/70">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
