import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type Props = {
  title: string;
  excerpt?: string;
  onGenerated: (text: string) => void;
};

// Targeted meta-description generator panel. Keywords + brand message +
// marketing message + USPs + tone. Calls the dedicated Haiku-backed edge
// function so the result is short, constrained, and SERP-optimised.
export function MetaDescriptionGenerator({ title, excerpt, onGenerated }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [brandMessage, setBrandMessage] = useState("");
  const [marketingMessage, setMarketingMessage] = useState("");
  const [usps, setUsps] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [example, setExample] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    if (!title.trim()) {
      toast({ title: "Add a title first", description: "Meta description needs a title to anchor on.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meta-description", {
        body: {
          title,
          excerpt: excerpt ?? "",
          keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
          brand_message: brandMessage,
          marketing_message: marketingMessage,
          usps,
          brand_tone: brandTone,
          example,
          max_chars: 155,
        },
      });
      if (error) throw error;
      const text = data?.meta_description?.trim();
      if (!text) throw new Error("Empty response");
      onGenerated(text);
      toast({ title: "Meta description generated ✓" });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
      >
        <Sparkles className="h-3 w-3" />
        Generate with inputs
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Meta description inputs</p>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Search keywords (comma-separated, 1–5)</label>
        <input
          type="text"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          placeholder="ai compliance training, fca, regulatory audit"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">Google bolds matched terms in the SERP. Match the queries you want to rank for.</p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Brand message / strapline (why us)</label>
        <input
          type="text"
          value={brandMessage}
          onChange={e => setBrandMessage(e.target.value)}
          placeholder="The AI-native LMS for regulated industries"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Compelling marketing message (why now)</label>
        <input
          type="text"
          value={marketingMessage}
          onChange={e => setMarketingMessage(e.target.value)}
          placeholder="EU AI Act enforcement begins August 2026 — get audit-ready in weeks, not quarters."
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">USPs / value adds / offer / CTA</label>
        <input
          type="text"
          value={usps}
          onChange={e => setUsps(e.target.value)}
          placeholder="SCORM export, 100+ languages, 14-day free trial"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Brand tone</label>
        <input
          type="text"
          value={brandTone}
          onChange={e => setBrandTone(e.target.value)}
          placeholder="expert, direct, no marketing fluff"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Good example (optional)</label>
        <textarea
          value={example}
          onChange={e => setExample(e.target.value)}
          placeholder="Paste a meta description you like — the model will mirror its style, not copy it."
          rows={2}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? "Generating…" : "Generate meta description"}
      </button>
    </div>
  );
}
