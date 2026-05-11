import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Sparkles, Radar, RefreshCw } from "lucide-react";

type Config = {
  brand_name: string;
  brand_url: string;
  brand_aliases: string[];
  competitors: string[];
  prompts: string[];
  model_tier: "fast" | "balanced" | "premium";
  runs_per_prompt: number;
  web_browsing: boolean;
  use_llm_judge: boolean;
  owned_domains: string[];
  competitor_domains: Record<string, string[]>;
};

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";

export default function BrandTrackerSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cfg, setCfg] = useState<Config>({ brand_name: "", brand_url: "", brand_aliases: [], competitors: [], prompts: [], model_tier: "premium", runs_per_prompt: 5, web_browsing: true, use_llm_judge: true, owned_domains: [], competitor_domains: {} });
  const [resolvingDomain, setResolvingDomain] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [promptInput, setPromptInput] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("brand_tracker_config" as any).select("*").maybeSingle();
      if (data) {
        const d = data as any;
        setCfg({
          brand_name: d.brand_name || "",
          brand_url: d.brand_url || "",
          brand_aliases: d.brand_aliases || [],
          competitors: d.competitors || [],
          prompts: d.prompts || [],
          model_tier: d.model_tier || "premium",
          runs_per_prompt: d.runs_per_prompt || 5,
          web_browsing: d.web_browsing !== false,
          use_llm_judge: d.use_llm_judge !== false,
          owned_domains: d.owned_domains || [],
          competitor_domains: d.competitor_domains || {},
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
    // For competitors, kick off domain resolution in the background.
    if (key === "competitors") resolveDomain(v);
  }

  function removeFromList(key: "brand_aliases" | "competitors" | "prompts", value: string) {
    if (key === "competitors") {
      const { [value]: _, ...rest } = cfg.competitor_domains;
      setCfg({ ...cfg, competitors: cfg.competitors.filter((x) => x !== value), competitor_domains: rest });
    } else {
      setCfg({ ...cfg, [key]: cfg[key].filter((x) => x !== value) });
    }
  }

  async function resolveDomain(name: string) {
    setResolvingDomain(name);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-brand-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.domains) && data.domains.length > 0) {
        setCfg((prev) => ({ ...prev, competitor_domains: { ...prev.competitor_domains, [name]: data.domains } }));
        if (!data.verified) toast({ title: `Found domains for ${name}`, description: data.note || "Please double-check the suggested domains before saving." });
      }
    } catch (e: any) {
      console.error("resolve-brand-domain failed", e);
    } finally {
      setResolvingDomain(null);
    }
  }

  async function resolveOwnedDomains() {
    if (!cfg.brand_name) { toast({ title: "Set your brand name first", variant: "destructive" }); return; }
    setResolvingDomain("__own__");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-brand-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: cfg.brand_name }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.domains)) {
        const merged = Array.from(new Set([...(cfg.owned_domains || []), ...data.domains]));
        setCfg((prev) => ({ ...prev, owned_domains: merged }));
        toast({ title: `Found ${data.domains.length} domain(s) for ${cfg.brand_name}` });
      }
    } finally { setResolvingDomain(null); }
  }

  function setCompetitorDomains(name: string, domains: string[]) {
    setCfg({ ...cfg, competitor_domains: { ...cfg.competitor_domains, [name]: domains } });
  }

  function setOwnedDomains(domains: string[]) {
    setCfg({ ...cfg, owned_domains: domains });
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

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">Your owned domains</Label>
            <Button size="sm" variant="outline" onClick={resolveOwnedDomains} disabled={resolvingDomain === "__own__" || !cfg.brand_name}>
              {resolvingDomain === "__own__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="ml-1">Auto-detect</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-1">Domains we should classify as "You" in citations. Auto-detect uses LLM + web search to find your real domain(s). Edit freely.</p>
          <DomainPills domains={cfg.owned_domains} onChange={setOwnedDomains} />
        </div>

        <div>
          <Label className="text-xs">Competitors</Label>
          <p className="text-[11px] text-muted-foreground mb-1">When you add a competitor, we look up their real website via LLM + web search instead of guessing the domain. You can edit the resolved domains.</p>
          <div className="flex gap-2 mb-2">
            <Input value={competitorInput} onChange={(e) => setCompetitorInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToList("competitors", competitorInput, setCompetitorInput); } }} placeholder="e.g. TalentLMS" />
            <Button size="sm" onClick={() => addToList("competitors", competitorInput, setCompetitorInput)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          {cfg.competitors.length > 0 && (
            <div className="space-y-2">
              {cfg.competitors.map((name) => (
                <div key={name} className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{name}</span>
                      {resolvingDomain === name && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => resolveDomain(name)} disabled={resolvingDomain === name} title="Re-resolve domains">
                        <RefreshCw className={`h-3 w-3 ${resolvingDomain === name ? "animate-spin" : ""}`} />
                      </Button>
                      <button onClick={() => removeFromList("competitors", name)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <DomainPills
                    domains={cfg.competitor_domains[name] || []}
                    onChange={(domains) => setCompetitorDomains(name, domains)}
                    emptyHint={resolvingDomain === name ? "Looking up domains…" : "No domains resolved yet. Click ↻ to look up, or paste manually."}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

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

        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Accuracy & cost</Label>
            <CostEstimate cfg={cfg} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Model tier</Label>
              <p className="text-[11px] text-muted-foreground mb-1">Higher tiers reflect what real users see better, at higher cost per run.</p>
              <select
                value={cfg.model_tier}
                onChange={(e) => setCfg({ ...cfg, model_tier: e.target.value as Config["model_tier"] })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="fast">Fast — gpt-4o-mini · haiku-4.5 · sonar</option>
                <option value="balanced">Balanced — gpt-4o · sonnet-4.6 · sonar</option>
                <option value="premium">Premium — gpt-4o · opus-4.7 · sonar-pro</option>
              </select>
            </div>

            <div>
              <Label className="text-xs">Runs per prompt</Label>
              <p className="text-[11px] text-muted-foreground mb-1">Each prompt fires N times per provider. Averaging cuts noise from non-determinism.</p>
              <select
                value={cfg.runs_per_prompt}
                onChange={(e) => setCfg({ ...cfg, runs_per_prompt: parseInt(e.target.value, 10) })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}× per prompt</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.web_browsing}
                onChange={(e) => setCfg({ ...cfg, web_browsing: e.target.checked })}
                className="mt-0.5"
              />
              <div className="text-xs">
                <div className="font-medium">Enable web browsing</div>
                <div className="text-muted-foreground">Lets ChatGPT and Claude search the web before answering — closer to chatgpt.com / claude.ai user experience. Perplexity always browses. Slower, slightly more expensive.</div>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.use_llm_judge}
                onChange={(e) => setCfg({ ...cfg, use_llm_judge: e.target.checked })}
                className="mt-0.5"
              />
              <div className="text-xs">
                <div className="font-medium">Use LLM-as-judge for mention detection</div>
                <div className="text-muted-foreground">After each response, Claude haiku rates whether your brand was mentioned (catching paraphrases, acronyms, pronouns) plus sentiment + prominence. Removes false positives where your name is a common word. Adds ~$0.001 per response.</div>
              </div>
            </label>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Save brand tracker config"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DomainPills({ domains, onChange, emptyHint }: { domains: string[]; onChange: (d: string[]) => void; emptyHint?: string }) {
  const [input, setInput] = useState("");
  function normalize(raw: string): string {
    return raw.trim().toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
  }
  function add() {
    const v = normalize(input);
    if (!v || !v.includes(".")) { setInput(""); return; }
    if (domains.includes(v)) { setInput(""); return; }
    onChange([...domains, v]);
    setInput("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1 items-center">
        {domains.map((d) => (
          <Badge key={d} variant="outline" className="gap-1 pl-2 pr-1 text-[11px]">
            {d}
            <button onClick={() => onChange(domains.filter((x) => x !== d))} className="text-muted-foreground hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        {domains.length === 0 && emptyHint && <span className="text-[11px] text-muted-foreground italic">{emptyHint}</span>}
      </div>
      <div className="flex gap-1 mt-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="domain.com"
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-7"><Plus className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

// Rough USD cost estimate per "Run all prompts" click. Multipliers are based
// on Nov 2025 per-1M-token prices, assuming ~600 input + ~600 output tokens
// per response. Web search adds a small flat per-query fee on some providers.
function CostEstimate({ cfg }: { cfg: Config }) {
  const responsesPerRun = cfg.prompts.length * cfg.runs_per_prompt * 3; // 3 providers
  // per-response cost in cents (approx, rounded up to keep estimates conservative)
  const perResponse = cfg.model_tier === "fast" ? 0.15 : cfg.model_tier === "balanced" ? 0.6 : 2.5;
  const judgeCost = cfg.use_llm_judge ? 0.1 : 0;
  const browsingCost = cfg.web_browsing ? 0.3 : 0;
  const totalCents = responsesPerRun * (perResponse + judgeCost + browsingCost);
  const dollars = totalCents / 100;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      ~${dollars.toFixed(2)} per run · {responsesPerRun} responses
    </span>
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
