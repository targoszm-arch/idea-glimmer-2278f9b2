import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb, Sparkles, Loader2, ArrowRight, Trash2, CalendarIcon, List, CalendarPlus, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import PageLayout from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase, type ContentIdea } from "@/lib/supabase";
import { streamAI } from "@/lib/ai-stream";
import { TONE_PRESETS } from "@/lib/tones";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import UpgradeModal from "@/components/UpgradeModal";
import TopUpModal from "@/components/TopUpModal";
import { useUpgrade } from "@/hooks/use-upgrade";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";

const strategyColors: Record<string, string> = {
  TOFU: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MOFU: "bg-amber-100 text-amber-700 border-amber-200",
  BOFU: "bg-rose-100 text-rose-700 border-rose-200",
};

const strategyDotColors: Record<string, string> = {
  TOFU: "bg-emerald-500",
  MOFU: "bg-amber-500",
  BOFU: "bg-rose-500",
};

const ContentIdeas = () => {
  const { showUpgrade, setShowUpgrade, showTopUp, setShowTopUp, checkCredits } = useUpgrade();
  const navigate = useNavigate();
  const nicheRef = useRef<HTMLInputElement>(null);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [generatingArticleId, setGeneratingArticleId] = useState<string | null>(null);
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const { credits, loading: creditsLoading, hasEnough, deductLocally } = useCredits();
  const [aiSettings, setAiSettings] = useState<{
    app_description: string;
    app_audience: string;
    tone_key: string;
    tone_label: string;
    tone_description: string;
    reference_urls: string[];
  } | null>(null);

  useEffect(() => {
    fetchIdeas();
    (async () => {
      const { data } = await supabase.from("ai_settings").select("*").limit(1).single();
      if (data) setAiSettings(data as any);
    })();
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
    const niche = nicheRef.current?.value ?? "";
    if (!niche.trim() && !aiSettings?.app_description) {
      toast({ title: "No context available", description: "Enter a niche or configure your AI Settings first.", variant: "destructive" });
      return;
    }
    if (!creditsLoading && !hasEnough("generate_ideas")) {
      setShowCreditsDialog(true);
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ideas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            niche: (nicheRef.current?.value ?? "").trim() || undefined,
            app_description: aiSettings?.app_description || "",
            app_audience: aiSettings?.app_audience || "",
            tone: aiSettings?.tone_label || "",
            tone_description: aiSettings?.tone_description || "",
            reference_urls: aiSettings?.reference_urls || [],
          }),
        }
      );

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t);
      }

      const result = await resp.json();
      if (result.ideas && Array.isArray(result.ideas)) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { error } = await supabase.from("content_ideas").insert(
          result.ideas.map((idea: any) => ({
            user_id: currentUser?.id,
            topic: idea.topic || (nicheRef.current?.value ?? "") || aiSettings?.app_description || "",
            title_suggestion: idea.title,
            description: idea.description || "",
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

  const handleUseIdea = useCallback(async (idea: ContentIdea) => {
    if (generatingArticleId) return;
    if (!creditsLoading && !hasEnough("generate_article")) {
      setShowCreditsDialog(true);
      return;
    }
    setGeneratingArticleId(idea.id);

    const tonePreset = TONE_PRESETS.find((t) => t.key === (aiSettings?.tone_key || "informative"));
    let accumulated = "";
    let articleTitle = idea.title_suggestion;

    toast({ title: "Generating article...", description: `"${idea.title_suggestion}" — this may take a moment.` });

    await streamAI({
      functionName: "generate-article",
      body: {
        topic: idea.title_suggestion,
        tone: aiSettings?.tone_label || tonePreset?.label || "Informative",
        tone_description: aiSettings?.tone_description || tonePreset?.description || "",
        category: idea.category,
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || [],
      },
      onDelta: (text) => {
        accumulated += text;
        // Extract title from first H1
        const h1Match = accumulated.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) articleTitle = h1Match[1].replace(/<[^>]*>/g, "");
      },
      onDone: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast({ title: "Session expired", description: "Please sign in again to save the generated article.", variant: "destructive" });
          setGeneratingArticleId(null);
          navigate("/login");
          return;
        }

        // Parse meta title and description from comments (supports both // and <!-- --> formats)
        const metaTitleMatch = accumulated.match(/<!--\s*META_TITLE:\s*(.*?)\s*-->/i)
          || accumulated.match(/\/\/\s*META_TITLE:\s*(.+)/i);
        const metaDescMatch = accumulated.match(/<!--\s*META_DESCRIPTION:\s*(.*?)\s*-->/i)
          || accumulated.match(/\/\/\s*META_DESCRIPTION:\s*(.+)/i);
        const metaTitle = metaTitleMatch ? metaTitleMatch[1].trim() : "";
        const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

        // Remove meta comments from article content
        const cleanContent = accumulated
          .replace(/<!--\s*META_TITLE:.*?-->/gi, "")
          .replace(/<!--\s*META_DESCRIPTION:.*?-->/gi, "")
          .replace(/\/\/\s*META_TITLE:.*$/gim, "")
          .replace(/\/\/\s*META_DESCRIPTION:.*$/gim, "")
          .replace(/\[\d+\]/g, "")
          .replace(/^```html\s*/i, "")
          .replace(/```\s*$/g, "")
          .replace(/^html\s*/i, "")
          .trim();

        // Generate cover image
        let coverImageUrl: string | null = null;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          const imgResp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover-image`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ prompt: idea.title_suggestion }),
            }
          );
          if (imgResp.ok) {
            const imgData = await imgResp.json();
            coverImageUrl = imgData.image_url || null;
          } else {
            console.error("Cover image generation failed:", imgResp.status);
            toast({ title: "Cover image failed", description: "Article saved without a cover image.", variant: "destructive" });
          }
        } catch (imgErr) {
          console.error("Cover image error:", imgErr);
          toast({ title: "Cover image failed", description: "Article saved without a cover image.", variant: "destructive" });
        }

        const slug = articleTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 64).replace(/-+$/, "");
        const excerpt = cleanContent.replace(/<[^>]*>/g, "").slice(0, 200);

const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { data: articleData, error: saveError } = await supabase.from("articles").insert({
          user_id: currentUser?.id,
          title: metaTitle || articleTitle,
          slug,
          content: cleanContent,
          excerpt,
          meta_description: (metaDescription || excerpt).slice(0, 255),
          category: idea.category,
          status: "draft",
          cover_image_url: coverImageUrl,
        }).select().single();

        if (saveError) {
          if (saveError.code === "42501") {
            toast({ title: "Permission error", description: "Please sign in again, then retry.", variant: "destructive" });
            navigate("/login");
          } else {
            toast({ title: "Failed to save article", description: saveError.message, variant: "destructive" });
          }
          setGeneratingArticleId(null);
          return;
        }

        // Update idea with article_id and status
        await supabase.from("content_ideas").update({
          status: "used",
          article_id: articleData.id,
        }).eq("id", idea.id);

        setIdeas((prev) => prev.map((i) =>
          i.id === idea.id ? { ...i, status: "used", article_id: articleData.id } : i
        ));

        setGeneratingArticleId(null);
        toast({ title: "Article generated!", description: `"${articleTitle}" saved as draft.` });
      },
      onError: (error) => {
        setGeneratingArticleId(null);
        toast({ title: "Article generation failed", description: error, variant: "destructive" });
      },
    });
  }, [aiSettings, generatingArticleId, navigate]);

  const handleDeleteIdea = async (id: string) => {
    const { error } = await supabase.from("content_ideas").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleSchedule = async (ideaId: string, date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const { error } = await supabase.from("content_ideas").update({ scheduled_for: dateStr }).eq("id", ideaId);
    if (error) {
      toast({ title: "Scheduling failed", description: error.message, variant: "destructive" });
    } else {
      setIdeas((prev) => prev.map((i) => i.id === ideaId ? { ...i, scheduled_for: dateStr } : i));
      toast({ title: "Scheduled!", description: `Content scheduled for ${format(date, "MMM d, yyyy")}` });
    }
    setSchedulingId(null);
  };

  const handleUnschedule = async (ideaId: string) => {
    const { error } = await supabase.from("content_ideas").update({ scheduled_for: null }).eq("id", ideaId);
    if (error) {
      toast({ title: "Failed to unschedule", description: error.message, variant: "destructive" });
    } else {
      setIdeas((prev) => prev.map((i) => i.id === ideaId ? { ...i, scheduled_for: null } : i));
    }
  };

  // Calendar helpers
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const scheduledIdeas = ideas.filter((i) => i.scheduled_for);

  const getIdeasForDay = (day: Date) =>
    scheduledIdeas.filter((i) => i.scheduled_for && isSameDay(new Date(i.scheduled_for), day));

  const IdeaCard = memo(({ idea, index }: { idea: ContentIdea; index: number }) => {
    const isGeneratingThis = generatingArticleId === idea.id;
    const hasArticle = !!idea.article_id;

    return (
      <motion.div
        key={idea.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          "group relative rounded-xl border bg-card p-5 transition-all hover:shadow-md",
          isGeneratingThis && "border-primary/50 bg-primary/5 animate-pulse",
          !isGeneratingThis && idea.status === "used" ? "border-border/50" : "border-border hover:border-primary/30"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${strategyColors[idea.strategy] || ""}`}>
            {idea.strategy}
          </span>
          <div className="flex items-center gap-2">
            {idea.scheduled_for && (
              <Badge variant="outline" className="text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {format(new Date(idea.scheduled_for), "MMM d")}
              </Badge>
            )}
            {isGeneratingThis && <Badge className="text-xs gap-1 bg-primary"><Loader2 className="h-3 w-3 animate-spin" /> Generating</Badge>}
            {hasArticle && !isGeneratingThis && <Badge variant="secondary" className="text-xs">Article Ready</Badge>}
          </div>
        </div>
        <h3 className="mb-2 font-bold text-foreground line-clamp-2">{idea.title_suggestion}</h3>
        {idea.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-3">{idea.description}</p>
        )}
        {idea.category && (
          <p className="mb-4 text-xs text-muted-foreground">{idea.category}</p>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDeleteIdea(idea.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              disabled={isGeneratingThis}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <Popover open={schedulingId === idea.id} onOpenChange={(open) => setSchedulingId(open ? idea.id : null)}>
              <PopoverTrigger asChild>
                <button className="text-muted-foreground hover:text-primary transition-colors" title="Schedule" disabled={isGeneratingThis}>
                  <CalendarPlus className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={idea.scheduled_for ? new Date(idea.scheduled_for) : undefined}
                  onSelect={(date) => handleSchedule(idea.id, date)}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {idea.scheduled_for && (
                  <div className="px-3 pb-3">
                    <button
                      onClick={() => { handleUnschedule(idea.id); setSchedulingId(null); }}
                      className="w-full text-xs text-destructive hover:underline"
                    >
                      Remove schedule
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {hasArticle ? (
            <button
              onClick={() => navigate(`/article/${idea.article_id}`)}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Eye className="h-3 w-3" /> Preview Article
            </button>
          ) : (
            <button
              onClick={() => handleUseIdea(idea)}
              disabled={isGeneratingThis || !!generatingArticleId}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {isGeneratingThis ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-3 w-3" /> Generate Article</>
              )}
            </button>
          )}
        </div>
      </motion.div>
    );
  });  // end IdeaCard memo

  return (
    <>
    <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    <TopUpModal open={showTopUp} onClose={() => setShowTopUp(false)} />
    <PageLayout>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Content Ideas</h1>
            <p className="mt-1 text-muted-foreground">
              Generate AI-powered content ideas using TOFU/MOFU/BOFU strategy
            </p>
          </div>

          {/* Generation Form */}
          <div className="mb-8 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Generate Ideas</h2>
            </div>
            {aiSettings?.app_description && (
              <p className="mb-3 text-xs text-muted-foreground">
                Using your AI Settings: <span className="font-medium text-foreground">{aiSettings.app_description.slice(0, 80)}{aiSettings.app_description.length > 80 ? "…" : ""}</span>
                {aiSettings.app_audience && <> · Audience: <span className="font-medium text-foreground">{aiSettings.app_audience.slice(0, 60)}</span></>}
              </p>
            )}
            <div className="flex gap-3">
              <input
                ref={nicheRef}
                defaultValue=""

                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder={aiSettings?.app_description ? "Optional: add extra context or leave empty to use AI Settings" : "Describe your product or niche (e.g., B2B SaaS project management tool)"}
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

          {/* Tabs */}
          <Tabs defaultValue="ideas" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="ideas" className="gap-2">
                <List className="h-4 w-4" /> Ideas
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarIcon className="h-4 w-4" /> Calendar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ideas">
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
                    <IdeaCard key={idea.id} idea={idea} index={i} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="calendar">
              <div className="rounded-xl border border-border bg-card p-6">
                {/* Month navigation */}
                <div className="mb-6 flex items-center justify-between">
                  <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    ← Prev
                  </button>
                  <h2 className="text-lg font-bold text-foreground">{format(calendarMonth, "MMMM yyyy")}</h2>
                  <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    Next →
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[100px]" />
                  ))}
                  {daysInMonth.map((day) => {
                    const dayIdeas = getIdeasForDay(day);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "min-h-[100px] rounded-lg border p-1.5 transition-colors",
                          isToday ? "border-primary/50 bg-primary/5" : "border-border/50 hover:border-border"
                        )}
                      >
                        <span className={cn(
                          "inline-block rounded-full px-1.5 py-0.5 text-xs font-medium mb-1",
                          isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                        )}>
                          {format(day, "d")}
                        </span>
                        <div className="space-y-1">
                          {dayIdeas.map((idea) => (
                            <button
                              key={idea.id}
                              onClick={() => idea.article_id ? navigate(`/article/${idea.article_id}`) : handleUseIdea(idea)}
                              className={cn(
                                "w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight font-medium truncate border transition-colors hover:opacity-80",
                                strategyColors[idea.strategy] || "bg-secondary text-foreground"
                              )}
                              title={idea.title_suggestion}
                            >
                              {idea.title_suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Scheduled items list below calendar */}
                {scheduledIdeas.length > 0 && (
                  <div className="mt-6 border-t border-border pt-6">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming Scheduled Content</h3>
                    <div className="space-y-2">
                      {scheduledIdeas
                        .sort((a, b) => (a.scheduled_for! > b.scheduled_for! ? 1 : -1))
                        .map((idea) => (
                          <div key={idea.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                            <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", strategyDotColors[idea.strategy])} />
                            <span className="font-medium text-foreground flex-1 truncate">{idea.title_suggestion}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(new Date(idea.scheduled_for!), "MMM d, yyyy")}
                            </span>
                            <button
                              onClick={() => handleUnschedule(idea.id)}
                              className="text-xs text-muted-foreground hover:text-destructive"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
    </PageLayout>
    <OutOfCreditsDialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog} creditsAvailable={credits ?? 0} />
    </>
  );
};

export default ContentIdeas;
