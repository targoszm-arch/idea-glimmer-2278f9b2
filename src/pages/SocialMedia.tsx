import { useState, useEffect, useCallback, useRef } from "react";
import { Linkedin, Youtube, Twitter, Instagram, Film, Loader2, Sparkles, Trash2, Copy, Check, ChevronDown, ChevronUp, Lightbulb, Video, Play, Images, Clapperboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamAI } from "@/lib/ai-stream";
import { getEdgeFunctionHeaders } from "@/lib/edge-function-auth";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import CarouselSlidePreview, { parseCarouselContent } from "@/components/CarouselSlidePreview";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";
const platforms = [
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "twitter", label: "Twitter", icon: Twitter },
  { key: "instagram_carousel", label: "IG Carousel", icon: Instagram },
  { key: "instagram_reel", label: "IG Reel", icon: Film },
] as const;

type VideoMode = "text_post" | "sora_video" | "heygen_template" | "heygen_agent" | "multipage";

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
  video_url?: string | null;
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
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [videoProgressPercent, setVideoProgressPercent] = useState(0);
  const [videoMode, setVideoMode] = useState<VideoMode>("text_post");
  const [heygenTemplates, setHeygenTemplates] = useState<Array<{ template_id: string; name: string; thumbnail_image_url?: string }>>([]);
  const [selectedHeygenTemplateByIdea, setSelectedHeygenTemplateByIdea] = useState<Record<string, string>>({});
  const [loadingHeygenTemplates, setLoadingHeygenTemplates] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const { credits, hasEnough, deductLocally } = useCredits();

  const [aiSettings, setAiSettings] = useState<{
    app_description: string;
    app_audience: string;
    tone_label: string;
    tone_description: string;
    reference_urls: string[];
  } | null>(null);

  const [brandAssets, setBrandAssets] = useState<{ logos: any[]; visuals: any[] }>({ logos: [], visuals: [] });

  useEffect(() => {
    fetchData();
    supabase.from("ai_settings").select("*").limit(1).single().then(({ data }) => {
      if (data) setAiSettings(data as any);
    });
    supabase.from("brand_assets").select("*").then(({ data }) => {
      if (data) {
        setBrandAssets({
          logos: (data as any[]).filter((a) => a.type === "logo"),
          visuals: (data as any[]).filter((a) => a.type === "visual"),
        });
      }
    });
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
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
    if (!hasEnough("generate_social_ideas")) {
      setShowCreditsDialog(true);
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

  const callReelFunction = async (body: Record<string, unknown>) => {
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-reel-video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      let errMsg = t;
      try { errMsg = JSON.parse(t).error || t; } catch {}
      throw new Error(errMsg);
    }
    return resp.json();
  };

  const handleGenerateReelVideo = useCallback(async (idea: SocialPostIdea) => {
    if (generatingPostId) return;
    if (!hasEnough("generate_reel_video")) {
      setShowCreditsDialog(true);
      return;
    }
    setGeneratingPostId(idea.id);
    setExpandedPostId(idea.id);
    setVideoProgress("Generating video prompt...");
    setVideoProgressPercent(5);

    try {
      const startResult = await callReelFunction({
        action: "start",
        topic: idea.title_suggestion,
        tone: aiSettings?.tone_label || "Engaging",
        tone_description: aiSettings?.tone_description || "",
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || [],
      });

      const videoId = startResult.video_id;
      setVideoProgress("Video generation started. This may take 1-3 minutes...");
      setVideoProgressPercent(15);
      setStreamingContent(startResult.video_prompt || "");

      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 60;

        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            reject(new Error("Video generation timed out after 5 minutes"));
            return;
          }

          try {
            const statusResult = await callReelFunction({ action: "status", video_id: videoId });
            const status = statusResult.status;
            const progress = statusResult.progress || 0;

            if (status === "completed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              setVideoProgress("Downloading and saving video...");
              setVideoProgressPercent(90);
              resolve();
            } else if (status === "failed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              reject(new Error(statusResult.error?.message || "Video generation failed"));
            } else {
              const pct = Math.min(15 + (progress || (attempts / maxAttempts) * 70), 85);
              setVideoProgressPercent(pct);
              setVideoProgress(`Generating video... ${status === "in_progress" ? "Rendering" : "Queued"}`);
            }
          } catch (e) {
            console.warn("Poll error:", e);
          }
        }, 5000);
      });

      const dlResult = await callReelFunction({ action: "download", video_id: videoId });
      setVideoProgressPercent(100);

      const { data: postData, error: saveError } = await supabase.from("social_posts").insert({
        platform: idea.platform,
        topic: idea.topic,
        title: idea.title_suggestion,
        content: streamingContent || startResult.video_prompt || idea.title_suggestion,
        video_url: dlResult.video_url,
      }).select().single();

      if (saveError) throw new Error(saveError.message);

      await supabase.from("social_post_ideas").update({
        status: "used",
        post_id: postData.id,
      }).eq("id", idea.id);

      setIdeas((prev) => prev.map((i) =>
        i.id === idea.id ? { ...i, status: "used", post_id: postData.id } : i
      ));
      setPosts((prev) => ({ ...prev, [postData.id]: postData as SocialPost }));
      setVideoProgress(null);
      setVideoProgressPercent(0);
      setStreamingContent("");
      setGeneratingPostId(null);
      toast({ title: "Reel video generated!", description: `"${idea.title_suggestion}" video is ready.` });
    } catch (e) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setGeneratingPostId(null);
      setVideoProgress(null);
      setVideoProgressPercent(0);
      setStreamingContent("");
      toast({ title: "Video generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }, [aiSettings, generatingPostId, toast]);

  const handleGenerateMultipageReel = useCallback(async (idea: SocialPostIdea) => {
    if (generatingPostId) return;
    if (!hasEnough("generate_social_post")) {
      setShowCreditsDialog(true);
      return;
    }
    setGeneratingPostId(idea.id);
    setExpandedPostId(idea.id);
    setStreamingContent("");

    let accumulated = "";

    toast({ title: "Generating multipage reel...", description: `"${idea.title_suggestion}" — creating slides...` });

    await streamAI({
      functionName: "generate-social-post",
      body: {
        platform: "instagram_reel_multipage",
        topic: idea.title_suggestion,
        tone: aiSettings?.tone_label || "Engaging",
        tone_description: aiSettings?.tone_description || "",
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || [],
        brand_assets: brandAssets,
      },
      onDelta: (text) => {
        accumulated += text;
        setStreamingContent(accumulated);
      },
      onDone: async () => {
        const { data: postData, error: saveError } = await supabase.from("social_posts").insert({
          platform: idea.platform,
          topic: idea.topic,
          title: idea.title_suggestion,
          content: accumulated,
        }).select().single();

        if (saveError) {
          toast({ title: "Failed to save", description: saveError.message, variant: "destructive" });
          setGeneratingPostId(null);
          return;
        }

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
        toast({ title: "Multipage reel created!", description: `"${idea.title_suggestion}" slides ready.` });
      },
      onError: (error) => {
        setGeneratingPostId(null);
        setStreamingContent("");
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      },
    });
  }, [aiSettings, brandAssets, generatingPostId, toast]);

  const callHeygen = async (body: Record<string, unknown>) => {
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/heygen`,
      {
        method: "POST",
        headers: await getEdgeFunctionHeaders(),
        body: JSON.stringify(body),
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      let errMsg = t;
      try { errMsg = JSON.parse(t).error || t; } catch {}
      throw new Error(errMsg);
    }
    return resp.json();
  };

  const fetchHeygenTemplates = async () => {
    setLoadingHeygenTemplates(true);
    try {
      const data = await callHeygen({ action: "list_templates" });
      const tpls = data?.data?.templates || [];
      setHeygenTemplates(tpls);
      if (tpls.length === 0) {
        toast({ title: "No HeyGen templates found", description: "Create templates in your HeyGen dashboard." });
      }
    } catch (e) {
      toast({ title: "Failed to load HeyGen templates", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setLoadingHeygenTemplates(false);
  };

  const handleGenerateHeygenTemplate = useCallback(async (idea: SocialPostIdea) => {
    if (generatingPostId) return;
    if (!hasEnough("heygen_video")) {
      setShowCreditsDialog(true);
      return;
    }

    const templateId = selectedHeygenTemplateByIdea[idea.id];
    if (!templateId) {
      toast({ title: "Select a template", description: "Pick a HeyGen template for this post first.", variant: "destructive" });
      return;
    }

    setGeneratingPostId(idea.id);
    setExpandedPostId(idea.id);
    setVideoProgress("Fetching template variables...");
    setVideoProgressPercent(5);

    try {
      // 1. Fetch template details to get required variables
      const templateDetails = await callHeygen({
        action: "get_template",
        template_id: templateId,
      });

      const templateVars = templateDetails?.data?.variables || {};
      const varKeys = Object.keys(templateVars);

      // 2. Auto-fill variables: split idea description into scenes/fields
      const filledVariables: Record<string, { name: string; type: string; properties: { content: string } }> = {};
      const sentences = idea.description
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim().length > 0);

      for (let i = 0; i < varKeys.length; i++) {
        const key = varKeys[i];
        const varDef = templateVars[key];
        let content = "";

        if (varDef.type === "text") {
          // For script fields, assign sentences; for title fields, use the idea title
          if (key.toLowerCase().includes("title")) {
            content = idea.title_suggestion;
          } else {
            // Distribute sentences across script variables
            const scriptKeys = varKeys.filter((k) => !k.toLowerCase().includes("title") && templateVars[k].type === "text");
            const scriptIdx = scriptKeys.indexOf(key);
            const chunkSize = Math.max(1, Math.ceil(sentences.length / scriptKeys.length));
            const chunk = sentences.slice(scriptIdx * chunkSize, (scriptIdx + 1) * chunkSize);
            content = chunk.join(" ") || idea.title_suggestion;
          }
        }

        filledVariables[key] = {
          name: key,
          type: varDef.type || "text",
          properties: { content },
        };
      }

      setVideoProgress("Starting HeyGen video from template...");
      setVideoProgressPercent(10);

      // 3. Generate with filled variables
      const result = await callHeygen({
        action: "generate",
        template_id: templateId,
        title: idea.title_suggestion,
        variables: filledVariables,
      });

      const videoId = result?.data?.video_id;
      if (!videoId) throw new Error("No video_id returned from HeyGen");

      setVideoProgress("HeyGen is rendering your video. This can take up to 15 minutes...");
      setVideoProgressPercent(15);

      // Poll for status (up to 20 minutes)
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 240; // 20 min at 5s intervals
        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            reject(new Error("HeyGen video generation timed out after 20 minutes"));
            return;
          }
          try {
            const statusResult = await callHeygen({ action: "status", video_id: videoId });
            const status = statusResult?.data?.status;
            if (status === "completed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              resolve();
            } else if (status === "failed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              reject(new Error(statusResult?.data?.error || "HeyGen rendering failed"));
            } else {
              const pct = Math.min(15 + (attempts / maxAttempts) * 70, 85);
              setVideoProgressPercent(pct);
              setVideoProgress(`Rendering... (${status || "processing"}) — ${Math.floor((attempts * 5) / 60)}m ${(attempts * 5) % 60}s`);
            }
          } catch (e) {
            console.warn("Poll error:", e);
          }
        }, 5000);
      });

      // Download video to Supabase storage (HeyGen URLs expire)
      setVideoProgress("Downloading video to library...");
      setVideoProgressPercent(92);
      const dlResult = await callHeygen({ action: "download", video_id: videoId });
      const storedVideoUrl = dlResult?.video_url;
      if (!storedVideoUrl) throw new Error("Failed to download and store video");

      setVideoProgressPercent(100);

      const { data: postData, error: saveError } = await supabase
        .from("social_posts")
        .insert({
          platform: idea.platform,
          topic: idea.topic,
          title: idea.title_suggestion,
          content: `HeyGen template video: ${idea.title_suggestion}`,
          video_url: storedVideoUrl,
        })
        .select()
        .single();
      if (saveError) throw new Error(saveError.message);

      await supabase.from("social_post_ideas").update({ status: "used", post_id: postData.id }).eq("id", idea.id);
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: "used", post_id: postData.id } : i)));
      setPosts((prev) => ({ ...prev, [postData.id]: postData as SocialPost }));
      setVideoProgress(null);
      setVideoProgressPercent(0);
      setGeneratingPostId(null);
      toast({ title: "HeyGen video ready!", description: `"${idea.title_suggestion}" generated from template.` });
    } catch (e) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setGeneratingPostId(null);
      setVideoProgress(null);
      setVideoProgressPercent(0);
      toast({ title: "HeyGen generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }, [generatingPostId, selectedHeygenTemplateByIdea, toast]);

  const handleGenerateHeygenAgent = useCallback(async (idea: SocialPostIdea) => {
    if (generatingPostId) return;
    setGeneratingPostId(idea.id);
    setExpandedPostId(idea.id);
    setVideoProgress("Sending to HeyGen Video Agent...");
    setVideoProgressPercent(5);

    try {
      const prompt = `Create a professional Instagram Reel video about: ${idea.title_suggestion}. ${idea.description || ""}${aiSettings?.app_description ? ` Brand: ${aiSettings.app_description}.` : ""}${aiSettings?.app_audience ? ` Target audience: ${aiSettings.app_audience}.` : ""}`;

      const result = await callHeygen({ action: "agent", prompt });
      const videoId = result?.data?.video_id;
      if (!videoId) throw new Error("No video_id returned from HeyGen Agent");

      setVideoProgress("HeyGen Agent is creating your video. This can take up to 15 minutes...");
      setVideoProgressPercent(15);

      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 240;
        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            reject(new Error("HeyGen Agent video timed out after 20 minutes"));
            return;
          }
          try {
            const statusResult = await callHeygen({ action: "status", video_id: videoId });
            const status = statusResult?.data?.status;
            if (status === "completed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              resolve();
            } else if (status === "failed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              reject(new Error(statusResult?.data?.error || "HeyGen Agent failed"));
            } else {
              setVideoProgressPercent(Math.min(15 + (attempts / maxAttempts) * 70, 85));
              setVideoProgress(`Agent working... (${status || "processing"}) — ${Math.floor(attempts * 5 / 60)}m ${(attempts * 5) % 60}s`);
            }
          } catch (e) { console.warn("Poll error:", e); }
        }, 5000);
      });

      // Download video to Supabase storage
      setVideoProgress("Downloading video to library...");
      setVideoProgressPercent(92);
      const dlResult = await callHeygen({ action: "download", video_id: videoId });
      const storedVideoUrl = dlResult?.video_url;
      if (!storedVideoUrl) throw new Error("Failed to download and store video");

      setVideoProgressPercent(100);

      const { data: postData, error: saveError } = await supabase.from("social_posts").insert({
        platform: idea.platform,
        topic: idea.topic,
        title: idea.title_suggestion,
        content: `HeyGen Agent video: ${prompt}`,
        video_url: storedVideoUrl,
      }).select().single();
      if (saveError) throw new Error(saveError.message);

      await supabase.from("social_post_ideas").update({ status: "used", post_id: postData.id }).eq("id", idea.id);
      setIdeas((prev) => prev.map((i) => i.id === idea.id ? { ...i, status: "used", post_id: postData.id } : i));
      setPosts((prev) => ({ ...prev, [postData.id]: postData as SocialPost }));
      setVideoProgress(null);
      setVideoProgressPercent(0);
      setGeneratingPostId(null);
      toast({ title: "HeyGen Agent video ready!", description: `"${idea.title_suggestion}" created by AI agent.` });
    } catch (e) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setGeneratingPostId(null);
      setVideoProgress(null);
      setVideoProgressPercent(0);
      toast({ title: "HeyGen Agent failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }, [aiSettings, generatingPostId, toast]);

  const handleGeneratePost = useCallback(async (idea: SocialPostIdea) => {
    // Video generation modes (available for all platforms)
    if (videoMode === "sora_video") {
      return handleGenerateReelVideo(idea);
    }
    if (videoMode === "heygen_template") {
      return handleGenerateHeygenTemplate(idea);
    }
    if (videoMode === "heygen_agent") {
      return handleGenerateHeygenAgent(idea);
    }
    if (videoMode === "multipage") {
      return handleGenerateMultipageReel(idea);
    }

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
        brand_assets: brandAssets,
      },
      onDelta: (text) => {
        accumulated += text;
        setStreamingContent(accumulated);
      },
      onDone: async () => {
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
  }, [aiSettings, generatingPostId, toast, handleGenerateReelVideo, handleGenerateMultipageReel, handleGenerateHeygenTemplate, handleGenerateHeygenAgent, videoMode]);

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

  const renderIdeaCard = useCallback((idea: SocialPostIdea, index: number) => {
    const isGeneratingThis = generatingPostId === idea.id;
    const hasPost = !!idea.post_id;
    const post = idea.post_id ? posts[idea.post_id] : null;
    const isExpanded = expandedPostId === idea.id;
    const isReel = idea.platform === "instagram_reel";
    const isCarousel = idea.platform === "instagram_carousel";
    const displayContent = isGeneratingThis ? streamingContent : post?.content;
    const carouselData = isCarousel && displayContent ? parseCarouselContent(displayContent) : null;
    const hasVideo = !!post?.video_url;

    return (
      <motion.div
        key={idea.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        layout={false}
        className={cn(
          "rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
          isGeneratingThis && "border-primary/50 bg-primary/5",
          !isGeneratingThis && hasPost ? "border-border/50" : "border-border hover:border-primary/30"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase">{idea.platform.replace("_", " ")}</span>
          <div className="flex items-center gap-2">
            {isGeneratingThis && (
              <span className="text-xs text-primary flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> {isReel ? "Generating Video" : "Generating"}
              </span>
            )}
            {hasPost && !isGeneratingThis && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded flex items-center gap-1">
                {hasVideo && <Video className="h-3 w-3" />}
                {hasVideo ? "Video Ready" : "Post Ready"}
              </span>
            )}
          </div>
        </div>

        <h3 className="mb-2 font-bold text-foreground line-clamp-2">{idea.title_suggestion}</h3>
        {idea.description && (
          <p className="mb-4 text-sm text-muted-foreground line-clamp-3">{idea.description}</p>
        )}

        {/* Video progress for any video generation */}
        {isGeneratingThis && videoProgress && (
          <div className="mb-4 space-y-2">
            <Progress value={videoProgressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{videoProgress}</p>
            {streamingContent && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View video prompt</summary>
                <p className="mt-1 text-muted-foreground italic">{streamingContent}</p>
              </details>
            )}
          </div>
        )}

        {/* Expanded post content */}
        {isExpanded && (displayContent || hasVideo) && !isGeneratingThis && (
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {hasVideo ? "Generated Video" : isCarousel && carouselData ? "Carousel Preview" : "Generated Content"}
              </span>
              {post && !hasVideo && !carouselData && (
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
            {hasVideo ? (
              <div className="rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-96 mx-auto">
                <video
                  src={post!.video_url!}
                  controls
                  className="w-full h-full object-contain"
                  preload="metadata"
                />
              </div>
            ) : carouselData ? (
              <CarouselSlidePreview data={carouselData} />
            ) : (
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm max-h-80 overflow-y-auto">
                {displayContent}
              </div>
            )}
            {displayContent && hasVideo && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View video prompt</summary>
                <p className="mt-1 text-muted-foreground italic">{displayContent}</p>
              </details>
            )}
          </div>
        )}

        {/* Non-reel streaming content while generating */}
        {isExpanded && displayContent && isGeneratingThis && !isReel && (
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Generated Content</span>
            </div>
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm max-h-80 overflow-y-auto">
              {displayContent}
              <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5" />
            </div>
          </div>
        )}

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
                {isExpanded ? "Hide" : hasVideo ? "View Video" : "View Post"}
              </Button>
            )}
            {hasVideo && post?.video_url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(post.video_url!, "_blank")}
                className="text-xs gap-1"
              >
                <Play className="h-3 w-3" /> Download
              </Button>
            )}
            {!hasPost && videoMode === "heygen_template" && (
              <>
                {heygenTemplates.length > 0 ? (
                  <Select
                    value={selectedHeygenTemplateByIdea[idea.id] ?? ""}
                    onValueChange={(value) =>
                      setSelectedHeygenTemplateByIdea((prev) => ({
                        ...prev,
                        [idea.id]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue placeholder={loadingHeygenTemplates ? "Loading…" : "Template"} />
                    </SelectTrigger>
                    <SelectContent>
                      {heygenTemplates.map((tpl) => (
                        <SelectItem key={tpl.template_id} value={tpl.template_id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchHeygenTemplates}
                    disabled={loadingHeygenTemplates}
                    className="text-xs h-8 px-2 gap-1"
                  >
                    {loadingHeygenTemplates ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Clapperboard className="h-3 w-3" />
                    )}
                    {loadingHeygenTemplates ? "Loading" : "Load"}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleGeneratePost(idea)}
                  disabled={
                    isGeneratingThis ||
                    !!generatingPostId ||
                    !selectedHeygenTemplateByIdea[idea.id]
                  }
                  className="text-xs gap-1"
                >
                  {isGeneratingThis ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating Video...
                    </>
                  ) : (
                    <>
                      <Video className="h-3 w-3" /> Generate Video
                    </>
                  )}
                </Button>
              </>
            )}

            {!hasPost && videoMode !== "heygen_template" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleGeneratePost(idea)}
                disabled={isGeneratingThis || !!generatingPostId}
                className="text-xs gap-1"
              >
                {isGeneratingThis ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />{" "}
                    {videoMode === "multipage"
                      ? "Generating Slides..."
                      : videoMode === "text_post"
                        ? "Generating..."
                        : "Generating Video..."}
                  </>
                ) : (
                  <>
                    {videoMode === "text_post" ? (
                      <Sparkles className="h-3 w-3" />
                    ) : videoMode === "multipage" ? (
                      <Images className="h-3 w-3" />
                    ) : (
                      <Video className="h-3 w-3" />
                    )}{" "}
                    {videoMode === "text_post"
                      ? "Generate Post"
                      : videoMode === "sora_video"
                        ? "Sora Video"
                        : videoMode === "heygen_agent"
                          ? "HeyGen Agent"
                          : "Multipage"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }, [
    generatingPostId,
    posts,
    expandedPostId,
    streamingContent,
    videoProgress,
    videoProgressPercent,
    copiedId,
    videoMode,
    heygenTemplates,
    loadingHeygenTemplates,
    selectedHeygenTemplateByIdea,
    fetchHeygenTemplates,
    handleGeneratePost,
    handleCopy,
    handleDeleteIdea,
  ]);

  return (
    <PageLayout>
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
                  <>
                    {/* Generation Form */}
                    <div className="mb-8 rounded-xl border border-border bg-card p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-bold text-foreground">Generate {p.label} Ideas</h2>
                      </div>
                      {p.key !== "instagram_carousel" && (
                        <div className="mb-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Generation method:</p>
                          <div className="flex flex-wrap rounded-lg border border-input overflow-hidden">
                            {([
                              { key: "text_post" as VideoMode, label: "Text Post", icon: Sparkles },
                              { key: "sora_video" as VideoMode, label: "Sora Video", icon: Video },
                              { key: "heygen_template" as VideoMode, label: "Generate videos from template", icon: Clapperboard },
                              { key: "heygen_agent" as VideoMode, label: "Generate Video with A agent", icon: Sparkles },
                              ...(p.key === "instagram_reel" ? [{ key: "multipage" as VideoMode, label: "Multipage Reel", icon: Images }] : []),
                            ]).map((opt) => {
                              const OptIcon = opt.icon;
                              return (
                                <button
                                  key={opt.key}
                                  onClick={() => {
                                    setVideoMode(opt.key);
                                    if (opt.key === "heygen_template" && heygenTemplates.length === 0) {
                                      fetchHeygenTemplates();
                                    }
                                  }}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                                    videoMode === opt.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <OptIcon className="h-3 w-3" /> {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* HeyGen templates */}
                          {videoMode === "heygen_template" && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                              <p className="text-xs text-muted-foreground">
                                {loadingHeygenTemplates
                                  ? "Loading HeyGen templates…"
                                  : `${heygenTemplates.length} HeyGen templates loaded — select one per idea below.`}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchHeygenTemplates}
                                disabled={loadingHeygenTemplates}
                                className="text-xs h-7 gap-1"
                              >
                                {loadingHeygenTemplates ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Clapperboard className="h-3 w-3" />
                                )}
                                Refresh
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
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
                        {filteredIdeas.map((idea, index) => renderIdeaCard(idea, index))}
                      </div>
                    )}
                  </>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
    </PageLayout>
  );
};

export default SocialMedia;
