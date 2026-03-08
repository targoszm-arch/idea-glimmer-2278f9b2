import { useState, useEffect, useCallback } from "react";
import { Linkedin, Youtube, Twitter, Instagram, Film, Loader2, Sparkles, Trash2, Copy, Check, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamAI } from "@/lib/ai-stream";
import { cn } from "@/lib/utils";

const platforms = [
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "twitter", label: "Twitter", icon: Twitter },
  { key: "instagram_carousel", label: "IG Carousel", icon: Instagram },
  { key: "instagram_reel", label: "IG Reel", icon: Film },
] as const;

type Platform = (typeof platforms)[number]["key"];

type SocialPostIdea = {
  id: string;
  platform: string;
  topic: string;
  title_suggestion: string;
  description: string;
  status: string;
  post_id: string | null;
  created_at: string;
};

type SocialPost = {
  id: string;
  platform: string;
  topic: string;
  title: string;
  content: string;
  created_at: string;
};

const SocialMedia = () => {
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [niche, setNiche] = useState("");
  const [ideas, setIdeas] = useState<SocialPostIdea[]>([]);
  const [posts, setPosts] = useState<Record<string, SocialPost>>({});
  const [loading, setLoading] = useState(true);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [generatingPostId, setGeneratingPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const [aiSettings, setAiSettings] = useState<{
    app_description: string;
    app_audience: string;
    tone_label: string;
    tone_description: string;
    reference_urls: string[];
  } | null>(null);

  useEffect(() => {
    fetchData();
    supabase.from("ai_settings").select("*").limit(1).single().then(({ data }) => {
      if (data) setAiSettings(data as any);
    });
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [ideasResult, postsResult] = await Promise.all([
      supabase.from("social_post_ideas").select("*").order("created_at", { ascending: false }),
      supabase.from("social_posts").select("*").order("created_at", { ascending: false }),
    ]);

    if (ideasResult.data) setIdeas(ideasResult.data as SocialPostIdea[]);
    if (postsResult.data) {
      const postsMap: Record<string, SocialPost> = {};
      (postsResult.data as SocialPost[]).forEach((p) => {
        postsMap[p.id] = p;
      });
      setPosts(postsMap);
    }
    setLoading(false);
  };

  const filteredIdeas = ideas.filter((i) => i.platform === platform);

  const handleGenerateIdeas = async () => {
    if (!niche.trim() && !aiSettings?.app_description) {
      toast({ title: "No context", description: "Enter a topic or configure AI Settings.", variant: "destructive" });
      return;
    }

    setIsGeneratingIdeas(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-social-ideas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            platform,
            niche: niche.trim() || undefined,
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
        const { data, error } = await supabase.from("social_post_ideas").insert(
          result.ideas.map((idea: any) => ({
            platform,
            topic: idea.topic || niche || aiSettings?.app_description || "",
            title_suggestion: idea.title,
            description: idea.description || "",
            status: "unused",
          }))
        ).select();
        if (error) throw new Error(error.message);
        if (data) setIdeas((prev) => [...(data as SocialPostIdea[]), ...prev]);
        toast({ title: "Ideas generated!", description: `${result.ideas.length} new ${platform} ideas created.` });
      }
    } catch (e) {
      toast({ title: "Generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setIsGeneratingIdeas(false);
  };

  const handleGeneratePost = useCallback(async (idea: SocialPostIdea) => {
    if (generatingPostId) return;
    setGeneratingPostId(idea.id);
    setExpandedPostId(idea.id);
    setStreamingContent("");

    let accumulated = "";

    toast({ title: "Generating post...", description: `"${idea.title_suggestion}" — streaming content...` });

    await streamAI({
      functionName: "generate-social-post",
      body: {
        platform: idea.platform,
        topic: idea.title_suggestion,
        tone: aiSettings?.tone_label || "Informative",
        tone_description: aiSettings?.tone_description || "",
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || [],
      },
      onDelta: (text) => {
        accumulated += text;
        setStreamingContent(accumulated);
      },
      onDone: async () => {
        // Save post to DB
        const { data: postData, error: saveError } = await supabase.from("social_posts").insert({
          platform: idea.platform,
          topic: idea.topic,
          title: idea.title_suggestion,
          content: accumulated,
        }).select().single();

        if (saveError) {
          toast({ title: "Failed to save post", description: saveError.message, variant: "destructive" });
          setGeneratingPostId(null);
          return;
        }

        // Update idea with post_id and status
        await supabase.from("social_post_ideas").update({
          status: "used",
          post_id: postData.id,
        }).eq("id", idea.id);

        setIdeas((prev) => prev.map((i) =>
          i.id === idea.id ? { ...i, status: "used", post_id: postData.id } : i
        ));
        setPosts((prev) => ({ ...prev, [postData.id]: postData as SocialPost }));
        setStreamingContent("");
        setGeneratingPostId(null);
        toast({ title: "Post generated!", description: `"${idea.title_suggestion}" saved.` });
      },
      onError: (error) => {
        setGeneratingPostId(null);
        setStreamingContent("");
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      },
    });
  }, [aiSettings, generatingPostId, toast]);

  const handleDeleteIdea = async (id: string) => {
    const { error } = await supabase.from("social_post_ideas").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const IdeaCard = ({ idea, index }: { idea: SocialPostIdea; index: number }) => {
    const isGeneratingThis = generatingPostId === idea.id;
    const hasPost = !!idea.post_id;
    const post = idea.post_id ? posts[idea.post_id] : null;
    const isExpanded = expandedPostId === idea.id;
    const displayContent = isGeneratingThis ? streamingContent : post?.content;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          "rounded-xl border bg-card p-5 transition-all hover:shadow-md",
          isGeneratingThis && "border-primary/50 bg-primary/5",
          !isGeneratingThis && hasPost ? "border-border/50" : "border-border hover:border-primary/30"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase">{idea.platform.replace("_", " ")}</span>
          <div className="flex items-center gap-2">
            {isGeneratingThis && (
              <span className="text-xs text-primary flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Generating
              </span>
            )}
            {hasPost && !isGeneratingThis && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">Post Ready</span>
            )}
          </div>
        </div>

        <h3 className="mb-2 font-bold text-foreground line-clamp-2">{idea.title_suggestion}</h3>
        {idea.description && (
          <p className="mb-4 text-sm text-muted-foreground line-clamp-3">{idea.description}</p>
        )}

        {/* Expanded post content */}
        <AnimatePresence>
          {isExpanded && displayContent && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-lg border border-border bg-muted/30 p-4 relative"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Generated Content</span>
                {post && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(post.content, post.id)}
                    className="h-7 px-2"
                  >
                    {copiedId === post.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                )}
              </div>
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm max-h-80 overflow-y-auto">
                {displayContent}
                {isGeneratingThis && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <button
            onClick={() => handleDeleteIdea(idea.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            disabled={isGeneratingThis}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {hasPost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedPostId(isExpanded ? null : idea.id)}
                className="text-xs gap-1"
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {isExpanded ? "Hide" : "View Post"}
              </Button>
            )}
            {!hasPost && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleGeneratePost(idea)}
                disabled={isGeneratingThis || !!generatingPostId}
                className="text-xs gap-1"
              >
                {isGeneratingThis ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-3 w-3" /> Generate Post</>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-foreground mb-2">Social Media Generator</h1>
          <p className="text-muted-foreground mb-8">
            Generate platform-specific social content ideas, then create full posts on demand.
          </p>

          <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <TabsList className="grid w-full grid-cols-5 mb-6">
              {platforms.map((p) => {
                const Icon = p.icon;
                return (
                  <TabsTrigger key={p.key} value={p.key} className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{p.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {platforms.map((p) => (
              <TabsContent key={p.key} value={p.key}>
                {/* Generation Form */}
                <div className="mb-8 rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold text-foreground">Generate {p.label} Ideas</h2>
                  </div>
                  {aiSettings?.app_description && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      Using your AI Settings: <span className="font-medium text-foreground">{aiSettings.app_description.slice(0, 80)}{aiSettings.app_description.length > 80 ? "…" : ""}</span>
                    </p>
                  )}
                  <div className="flex gap-3">
                    <input
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
                      placeholder={aiSettings?.app_description ? "Optional: add extra context or leave empty" : "Describe your product or niche"}
                      className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      onClick={handleGenerateIdeas}
                      disabled={isGeneratingIdeas}
                      className="gap-2"
                    >
                      {isGeneratingIdeas ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Generate Ideas</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Ideas Grid */}
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredIdeas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No {p.label} ideas yet. Generate some above!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredIdeas.map((idea, index) => (
                      <IdeaCard key={idea.id} idea={idea} index={index} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default SocialMedia;
