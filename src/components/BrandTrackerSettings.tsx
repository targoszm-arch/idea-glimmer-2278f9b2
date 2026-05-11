import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Sparkles, Radar } from "lucide-react";

type Config = {
  brand_name: string;
  brand_url: string;
  brand_aliases: string[];
  competitors: string[];
  prompts: string[];
};

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";

export default function BrandTrackerSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cfg, setCfg] = useState<Config>({ brand_name: "", brand_url: "", brand_aliases: [], competitors: [], prompts: [] });
  const [aliasInput, setAliasInput] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [promptInput, setPromptInput] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("brand_tracker_config" as any).select("*").maybeSingle();
      if (data) {
        setCfg({
          brand_name: (data as any).brand_name || "",
          brand_url: (data as any).brand_url || "",
          brand_aliases: (data as any).brand_aliases || [],
          competitors: (data as any).competitors || [],
          prompts: (data as any).prompts || [],
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("brand_tracker_config" as any).upsert({
        user_id: user.id,
        ...cfg,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: "Brand tracker saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function addToList(key: "brand_aliases" | "competitors" | "prompts", value: string, setter: (s: string) => void) {
    const v = value.trim();
    if (!v) return;
    if (cfg[key].includes(v)) { setter(""); return; }
    setCfg({ ...cfg, [key]: [...cfg[key], v] });
    setter("");
  }

  function removeFromList(key: "brand_aliases" | "competitors" | "prompts", value: string) {
    setCfg({ ...cfg, [key]: cfg[key].filter((x) => x !== value) });
  }

  async function generatePrompts() {
    if (!cfg.brand_name) { toast({ title: "Set your brand name first", variant: "destructive" }); return; }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          mode: "brand-tracker-prompts",
          brand: cfg.brand_name,
          url: cfg.brand_url,
          competitors: cfg.competitors,
        }),
      });
      const data = await res.json();
      const generated: string[] = data?.prompts || data?.ideas || [];
      if (generated.length === 0) {
        // Fallback: synthesize 6 generic but useful prompts client-side.
        const cat = cfg.brand_name;
        const examples = [
          `What are the best tools for ${cat.toLowerCase().includes("ai") ? "content automation" : cfg.brand_name}'s category?`,
          `Compare top alternatives in the same space as ${cfg.brand_name}.`,
          `Who are the leaders in the category ${cfg.brand_name} operates in?`,
          `What software do you recommend for the problem ${cfg.brand_name} solves?`,
          `Pros and cons of using ${cfg.brand_name} vs alternatives.`,
          `Is ${cfg.brand_name} a good choice for a small business?`,
        ];
        setCfg({ ...cfg, prompts: Array.from(new Set([...cfg.prompts, ...examples])) });
        toast({ title: "Added 6 starter prompts", description: "AI generator unavailable — used fallback templates." });
      } else {
        setCfg({ ...cfg, prompts: Array.from(new Set([...cfg.prompts, ...generated])) });
        toast({ title: `Added ${generated.length} prompts` });
      }
    } catch (e: any) {
      toast({ title: "Generate failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg border border-border bg-violet-100 flex items-center justify-center">
            <Radar className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <CardTitle className="text-base">Brand Tracker</CardTitle>
            <CardDescription className="text-xs">Track how ChatGPT, Claude and Perplexity mention your brand vs competitors. Configure here, run from Monitor → Brand Tracker.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Brand name</Label>
            <Input value={cfg.brand_name} onChange={(e) => setCfg({ ...cfg, brand_name: e.target.value })} placeholder="ContentLab" />
          </div>
          <div>
            <Label className="text-xs">Brand URL</Label>
            <Input value={cfg.brand_url} onChange={(e) => setCfg({ ...cfg, brand_url: e.target.value })} placeholder="https://www.content-lab.ie" />
          </div>
        </div>

        <ListEditor
          label="Brand aliases"
          hint="Other names your brand is called (acronyms, old names, product names). Used to detect mentions even when the exact brand_name isn't used."
          value={aliasInput}
          onChange={setAliasInput}
          onAdd={() => addToList("brand_aliases", aliasInput, setAliasInput)}
          items={cfg.brand_aliases}
          onRemove={(v) => removeFromList("brand_aliases", v)}
        />

        <ListEditor
          label="Competitors"
          hint="Brands you want to track alongside yours. Mention frequency is your share-of-voice baseline."
          value={competitorInput}
          onChange={setCompetitorInput}
          onAdd={() => addToList("competitors", competitorInput, setCompetitorInput)}
          items={cfg.competitors}
          onRemove={(v) => removeFromList("competitors", v)}
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <Label className="text-xs">Tracked prompts</Label>
              <p className="text-[11px] text-muted-foreground">Questions a target customer might ask an LLM. Each runs against ChatGPT + Claude + Perplexity.</p>
            </div>
            <Button size="sm" variant="outline" onClick={generatePrompts} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="ml-1">Suggest prompts</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToList("prompts", promptInput, setPromptInput); } }}
              placeholder="e.g. What's the best tool for AI-powered content generation?"
            />
            <Button size="sm" onClick={() => addToList("prompts", promptInput, setPromptInput)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {cfg.prompts.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {cfg.prompts.map((p) => (
                <div key={p} className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs">
                  <span className="flex-1">{p}</span>
                  <button onClick={() => removeFromList("prompts", p)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Save brand tracker config"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ListEditor({
  label, hint, value, onChange, onAdd, items, onRemove,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; onAdd: () => void;
  items: string[]; onRemove: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground mb-1">{hint}</p>}
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
        <Button size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <Badge key={it} variant="outline" className="gap-1 pl-2 pr-1 text-xs">
              {it}
              <button onClick={() => onRemove(it)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
