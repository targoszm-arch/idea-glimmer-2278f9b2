import { useState, useEffect } from "react";
import { Linkedin, Youtube, Twitter, Instagram, Film, Copy, Check, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamAI } from "@/lib/ai-stream";

const platforms = [
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "twitter", label: "Twitter", icon: Twitter },
  { key: "instagram_carousel", label: "IG Carousel", icon: Instagram },
  { key: "instagram_reel", label: "IG Reel", icon: Film },
] as const;

type Platform = (typeof platforms)[number]["key"];

const SocialMedia = () => {
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [topic, setTopic] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Load AI settings
  const [aiSettings, setAiSettings] = useState<{
    app_description: string;
    app_audience: string;
    tone_label: string;
    tone_description: string;
    reference_urls: string[];
  } | null>(null);

  useEffect(() => {
    supabase.from("ai_settings").select("*").limit(1).single().then(({ data }) => {
      if (data) setAiSettings(data);
    });
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setOutput("");
    setLoading(true);

    await streamAI({
      functionName: "generate-social-post",
      body: {
        platform,
        topic: topic.trim(),
        tone: aiSettings?.tone_label || "Informative",
        tone_description: aiSettings?.tone_description || "",
        app_description: aiSettings?.app_description || "",
        app_audience: aiSettings?.app_audience || "",
        reference_urls: aiSettings?.reference_urls || [],
      },
      onDelta: (text) => setOutput((prev) => prev + text),
      onDone: async () => {
        setLoading(false);
        // Save to DB
        const finalOutput = document.getElementById("social-output")?.textContent || "";
        await supabase.from("social_posts").insert({
          platform,
          topic: topic.trim(),
          content: finalOutput,
        });
      },
      onError: (err) => {
        setLoading(false);
        toast({ title: "Error", description: err, variant: "destructive" });
      },
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-8 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-foreground mb-2">Social Media Generator</h1>
          <p className="text-muted-foreground mb-8">
            Generate platform-specific social content powered by AI.
          </p>

          <Tabs value={platform} onValueChange={(v) => { setPlatform(v as Platform); setOutput(""); }}>
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
                <div className="space-y-4">
                  <Textarea
                    placeholder={`What should your ${p.label} content be about?`}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !topic.trim()}
                    className="w-full sm:w-auto"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {loading ? "Generating..." : `Generate ${p.label} Content`}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {(output || loading) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 rounded-lg border border-border bg-card p-6 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Generated Content
                </h3>
                {output && (
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>
              <div
                id="social-output"
                className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap"
              >
                {output}
                {loading && <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-0.5" />}
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default SocialMedia;
