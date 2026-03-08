import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb, Sparkles, Loader2, ArrowRight, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { supabase, type ContentIdea } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const strategyColors: Record<string, string> = {
  TOFU: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MOFU: "bg-amber-100 text-amber-700 border-amber-200",
  BOFU: "bg-rose-100 text-rose-700 border-rose-200",
};

const ContentIdeas = () => {
  const navigate = useNavigate();
  const [niche, setNiche] = useState("");
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_ideas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading ideas", description: error.message, variant: "destructive" });
    } else {
      setIdeas((data || []) as ContentIdea[]);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast({ title: "Enter your niche", description: "Describe your product or niche to generate ideas.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ideas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ niche }),
        }
      );

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t);
      }

      const result = await resp.json();
      if (result.ideas && Array.isArray(result.ideas)) {
        // Insert ideas into DB
        const { error } = await supabase.from("content_ideas").insert(
          result.ideas.map((idea: any) => ({
            topic: idea.topic || niche,
            title_suggestion: idea.title,
            strategy: idea.strategy || "TOFU",
            category: idea.category || "",
            status: "unused",
          }))
        );
        if (error) throw new Error(error.message);
        await fetchIdeas();
        toast({ title: "Ideas generated!", description: `${result.ideas.length} new content ideas created.` });
      }
    } catch (e) {
      toast({ title: "Generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setIsGenerating(false);
  };

  const handleUseIdea = async (idea: ContentIdea) => {
    await supabase.from("content_ideas").update({ status: "used" }).eq("id", idea.id);
    navigate(`/new?topic=${encodeURIComponent(idea.title_suggestion)}`);
  };

  const handleDeleteIdea = async (id: string) => {
    const { error } = await supabase.from("content_ideas").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Content Ideas</h1>
            <p className="mt-1 text-muted-foreground">
              Generate AI-powered content ideas using TOFU/MOFU/BOFU strategy
            </p>
          </div>

          {/* Generation Form */}
          <div className="mb-8 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Generate Ideas</h2>
            </div>
            <div className="flex gap-3">
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder="Describe your product or niche (e.g., B2B SaaS project management tool)"
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </button>
            </div>
          </div>

          {/* Strategy Legend */}
          <div className="mb-6 flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">Strategy:</span>
            {["TOFU", "MOFU", "BOFU"].map((s) => (
              <span key={s} className={`rounded-full border px-3 py-1 text-xs font-semibold ${strategyColors[s]}`}>
                {s} — {s === "TOFU" ? "Awareness" : s === "MOFU" ? "Consideration" : "Decision"}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
              <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h2 className="mb-2 text-lg font-semibold text-foreground">No ideas yet</h2>
              <p className="text-sm text-muted-foreground">Enter your niche above to generate content ideas.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ideas.map((idea, i) => (
                <motion.div
                  key={idea.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`group relative rounded-xl border bg-card p-5 transition-all hover:shadow-md ${
                    idea.status === "used" ? "border-border/50 opacity-60" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${strategyColors[idea.strategy] || ""}`}>
                      {idea.strategy}
                    </span>
                    {idea.status === "used" && <Badge variant="secondary" className="text-xs">Used</Badge>}
                  </div>
                  <h3 className="mb-2 font-bold text-foreground line-clamp-2">{idea.title_suggestion}</h3>
                  {idea.category && (
                    <p className="mb-4 text-xs text-muted-foreground">{idea.category}</p>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <button
                      onClick={() => handleDeleteIdea(idea.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleUseIdea(idea)}
                      className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      Use this idea <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default ContentIdeas;
