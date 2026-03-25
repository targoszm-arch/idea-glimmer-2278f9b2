import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Video, Play, RefreshCw, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { getEdgeFunctionHeaders } from "@/lib/edge-function-auth";
import { cn } from "@/lib/utils";
import { useCredits, CREDIT_COSTS } from "@/hooks/use-credits";
import OutOfCreditsDialog from "@/components/OutOfCreditsDialog";

type HeyGenTemplate = {
  template_id: string;
  name: string;
  thumbnail_image_url?: string;
};

type TemplateVariable = {
  name: string;
  type: string;
  properties?: {
    content?: string;
    url?: string;
    [key: string]: unknown;
  };
};

type TemplateDetail = {
  variables: Record<string, TemplateVariable>;
};

type GeneratedVideo = {
  template_id: string;
  template_name: string;
  video_id: string;
  status: string;
  video_url?: string;
};

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

export default function HeyGenPanel() {
  const [templates, setTemplates] = useState<HeyGenTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [videoProgressPercent, setVideoProgressPercent] = useState(0);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const { credits, loading: creditsLoading, hasEnough, deductLocally } = useCredits();

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await callHeygen({ action: "list_templates" });
      const tpls = data?.data?.templates || [];
      setTemplates(tpls);
      if (tpls.length === 0) {
        toast({ title: "No templates found", description: "Create templates in your HeyGen dashboard first." });
      }
    } catch (e) {
      toast({ title: "Failed to load templates", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setLoading(false);
  };

  const fetchTemplateDetail = async (templateId: string) => {
    setLoadingDetail(true);
    setTemplateDetail(null);
    setVariableValues({});
    try {
      const data = await callHeygen({ action: "get_template", template_id: templateId });
      const detail = data?.data;
      if (detail?.variables) {
        setTemplateDetail(detail);
        // Pre-fill with defaults
        const defaults: Record<string, string> = {};
        for (const [key, variable] of Object.entries(detail.variables as Record<string, TemplateVariable>)) {
          if (variable.type === "text" && variable.properties?.content) {
            defaults[key] = variable.properties.content;
          } else if (variable.type === "image" && variable.properties?.url) {
            defaults[key] = variable.properties.url;
          }
        }
        setVariableValues(defaults);
      }
    } catch (e) {
      toast({ title: "Failed to load template", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setLoadingDetail(false);
  };

  const handleSelectTemplate = (templateId: string) => {
    if (selectedTemplate === templateId) {
      setSelectedTemplate(null);
      setTemplateDetail(null);
    } else {
      setSelectedTemplate(templateId);
      fetchTemplateDetail(templateId);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate || generating) return;
    if (!creditsLoading && !hasEnough("heygen_video")) {
      setShowCreditsDialog(true);
      return;
    }
    setGenerating(true);
    setVideoProgress("Starting video generation...");
    setVideoProgressPercent(5);

    try {
      // Build variables payload
      const variables: Record<string, unknown> = {};
      if (templateDetail?.variables) {
        for (const [key, variable] of Object.entries(templateDetail.variables as Record<string, TemplateVariable>)) {
          const val = variableValues[key];
          if (val) {
            if (variable.type === "text") {
              variables[key] = { name: key, type: "text", properties: { content: val } };
            } else if (variable.type === "image") {
              variables[key] = { name: key, type: "image", properties: { url: val } };
            }
          }
        }
      }

      const templateName = templates.find((t) => t.template_id === selectedTemplate)?.name || "HeyGen Video";
      
      const result = await callHeygen({
        action: "generate",
        template_id: selectedTemplate,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
        title: templateName,
      });

      const videoId = result?.data?.video_id;
      if (!videoId) throw new Error("No video_id returned from HeyGen");

      setVideoProgress("Video queued. Rendering may take 1-5 minutes...");
      setVideoProgressPercent(15);

      const newVideo: GeneratedVideo = {
        template_id: selectedTemplate,
        template_name: templateName,
        video_id: videoId,
        status: "pending",
      };
      setGeneratedVideos((prev) => [newVideo, ...prev]);
      setExpandedVideoId(videoId);

      // Poll for status
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes

        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            reject(new Error("Video generation timed out"));
            return;
          }

          try {
            const statusResult = await callHeygen({ action: "status", video_id: videoId });
            const status = statusResult?.data?.status;

            if (status === "completed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              const videoUrl = statusResult?.data?.video_url;
              setGeneratedVideos((prev) =>
                prev.map((v) => v.video_id === videoId ? { ...v, status: "completed", video_url: videoUrl } : v)
              );
              setVideoProgressPercent(100);
              setVideoProgress(null);
              resolve();
            } else if (status === "failed") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              setGeneratedVideos((prev) =>
                prev.map((v) => v.video_id === videoId ? { ...v, status: "failed" } : v)
              );
              reject(new Error(statusResult?.data?.error || "Video rendering failed"));
            } else {
              const pct = Math.min(15 + (attempts / maxAttempts) * 75, 90);
              setVideoProgressPercent(pct);
              setVideoProgress(`Rendering video... (${status || "processing"})`);
            }
          } catch (e) {
            console.warn("Poll error:", e);
          }
        }, 5000);
      });

      toast({ title: "Video ready!", description: `"${templateName}" has been generated.` });
    } catch (e) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      toast({ title: "Generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setGenerating(false);
    setVideoProgress(null);
    setVideoProgressPercent(0);
  }, [selectedTemplate, templateDetail, variableValues, templates, generating, toast]);

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">HeyGen Templates</h2>
          </div>
          <Button onClick={fetchTemplates} disabled={loading} variant="secondary" size="sm" className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {templates.length > 0 ? "Refresh" : "Load Templates"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Select a HeyGen template, customize variables, and generate videos directly.
        </p>
      </div>

      {/* Templates grid */}
      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const isSelected = selectedTemplate === tpl.template_id;
            return (
              <motion.div
                key={tpl.template_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-md",
                  isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                )}
                onClick={() => handleSelectTemplate(tpl.template_id)}
              >
                {tpl.thumbnail_image_url && (
                  <div className="rounded-lg overflow-hidden mb-3 bg-muted aspect-video">
                    <img
                      src={tpl.thumbnail_image_url}
                      alt={tpl.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <h3 className="font-semibold text-foreground text-sm truncate">{tpl.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 truncate">{tpl.template_id}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Template variables editor */}
      {selectedTemplate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/30 bg-card p-6 space-y-4"
        >
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Customize Template Variables
          </h3>

          {loadingDetail ? (
            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading template details...
            </div>
          ) : templateDetail?.variables ? (
            <div className="space-y-3">
              {Object.entries(templateDetail.variables as Record<string, TemplateVariable>).map(([key, variable]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase">
                    {key} <span className="text-muted-foreground/60">({variable.type})</span>
                  </label>
                  {variable.type === "text" ? (
                    <textarea
                      value={variableValues[key] || ""}
                      onChange={(e) => setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[60px]"
                      placeholder={`Enter ${key}...`}
                    />
                  ) : variable.type === "image" ? (
                    <input
                      type="url"
                      value={variableValues[key] || ""}
                      onChange={(e) => setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder={`Image URL for ${key}...`}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Variable type "{variable.type}" — edit in HeyGen</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No editable variables in this template.</p>
          )}

          {/* Generate button */}
          <div className="pt-2">
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Video className="h-4 w-4" /> Generate Video</>
              )}
            </Button>
          </div>

          {/* Progress */}
          {videoProgress && (
            <div className="space-y-2">
              <Progress value={videoProgressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">{videoProgress}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Generated videos */}
      {generatedVideos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-foreground">Generated Videos</h3>
          {generatedVideos.map((vid) => {
            const isExpanded = expandedVideoId === vid.video_id;
            return (
              <div
                key={vid.video_id}
                className={cn(
                  "rounded-xl border bg-card p-5 transition-shadow",
                  vid.status === "completed" ? "border-primary/30" : "border-border"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">{vid.template_name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Status: <span className={cn(
                        "font-medium",
                        vid.status === "completed" ? "text-green-600" : vid.status === "failed" ? "text-destructive" : "text-primary"
                      )}>{vid.status}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {vid.video_url && (
                      <Button variant="ghost" size="sm" onClick={() => window.open(vid.video_url, "_blank")} className="text-xs gap-1">
                        <Play className="h-3 w-3" /> Download
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedVideoId(isExpanded ? null : vid.video_id)}
                      className="text-xs gap-1"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? "Hide" : "View"}
                    </Button>
                  </div>
                </div>

                {isExpanded && vid.video_url && (
                  <div className="mt-4 rounded-lg overflow-hidden bg-black aspect-video max-h-96 mx-auto">
                    <video
                      src={vid.video_url}
                      controls
                      className="w-full h-full object-contain"
                      preload="metadata"
                    />
                  </div>
                )}

                {isExpanded && vid.status === "pending" && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Rendering in progress...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    <OutOfCreditsDialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog} creditsNeeded={CREDIT_COSTS.heygen_video} creditsAvailable={credits ?? 0} />
    </>
  );
}
