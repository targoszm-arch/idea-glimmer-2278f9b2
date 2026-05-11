import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radar, RefreshCw, ExternalLink, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";

type Run = {
  id: string;
  prompt: string;
  provider: string;
  model: string | null;
  model_tier: string | null;
  response_text: string | null;
  mentions_brand: boolean;
  brand_position: number | null;
  mentions_competitors: string[];
  citations: string[];
  tokens_used: number | null;
  error: string | null;
  created_at: string;
  llm_judge_mentioned: boolean | null;
  llm_judge_sentiment: "positive" | "neutral" | "negative" | null;
  llm_judge_prominence: "primary" | "secondary" | "passing" | null;
  llm_judge_context: string | null;
  run_index: number;
  web_browsing_used: boolean;
};

type Config = {
  brand_name: string;
  brand_url: string;
  brand_aliases: string[];
  competitors: string[];
  prompts: string[];
};

function fmtPct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function BrandTracker() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const [cfgRes, runsRes] = await Promise.all([
      supabase.from("brand_tracker_config" as any).select("*").maybeSingle(),
      supabase.from("brand_tracker_runs" as any).select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    if (cfgRes.data) setCfg(cfgRes.data as any);
    setRuns(((runsRes.data as any) || []) as Run[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runAll() {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/brand-tracker-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ run_all_prompts: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast({ title: `Ran ${data.runs} queries`, description: `Brand hit rate: ${fmtPct(data.summary.brand_hit_rate, 0)}` });
      await load();
    } catch (e: any) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  // Aggregations -----------------------------------------------------------
  const totalRuns = runs.length;
  const validRuns = runs.filter((r) => !r.error);
  const brandHits = validRuns.filter((r) => r.mentions_brand).length;
  const visibility = validRuns.length ? brandHits / validRuns.length : 0;

  const visibilityByProvider = useMemo(() => {
    const groups: Record<string, { total: number; hits: number }> = {};
    for (const r of validRuns) {
      if (!groups[r.provider]) groups[r.provider] = { total: 0, hits: 0 };
      groups[r.provider].total++;
      if (r.mentions_brand) groups[r.provider].hits++;
    }
    return Object.entries(groups).map(([provider, v]) => ({
      provider, visibility: v.total ? v.hits / v.total : 0, runs: v.total,
    }));
  }, [validRuns]);

  const shareOfVoice = useMemo(() => {
    if (!cfg) return [];
    const counts: Record<string, number> = { [cfg.brand_name]: brandHits };
    for (const c of cfg.competitors) counts[c] = 0;
    for (const r of validRuns) {
      for (const c of r.mentions_competitors) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .map(([name, n]) => ({ name, mentions: n, share: n / total }))
      .sort((a, b) => b.mentions - a.mentions);
  }, [cfg, validRuns, brandHits]);

  const topCitations = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of validRuns) for (const url of r.citations) {
      const host = hostname(url);
      m[host] = (m[host] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [validRuns]);

  const trend = useMemo(() => {
    // Bucket by day, count visibility ratio per day.
    const byDay: Record<string, { total: number; hits: number }> = {};
    for (const r of validRuns) {
      const d = r.created_at.slice(0, 10);
      if (!byDay[d]) byDay[d] = { total: 0, hits: 0 };
      byDay[d].total++;
      if (r.mentions_brand) byDay[d].hits++;
    }
    return Object.entries(byDay)
      .map(([d, v]) => ({ date: d, visibility: Math.round((v.hits / v.total) * 100) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [validRuns]);

  const byPrompt = useMemo(() => {
    const m: Record<string, { total: number; hits: number; runs: Run[] }> = {};
    for (const r of validRuns) {
      if (!m[r.prompt]) m[r.prompt] = { total: 0, hits: 0, runs: [] };
      m[r.prompt].total++;
      if (r.mentions_brand) m[r.prompt].hits++;
      m[r.prompt].runs.push(r);
    }
    return Object.entries(m).map(([prompt, v]) => ({
      prompt, total: v.total, hits: v.hits, visibility: v.total ? v.hits / v.total : 0, runs: v.runs,
    })).sort((a, b) => a.visibility - b.visibility);
  }, [validRuns]);

  if (loading) {
    return <PageLayout><div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></PageLayout>;
  }

  if (!cfg?.brand_name) {
    return (
      <PageLayout>
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <Radar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-2xl font-bold mb-2">Brand Tracker not configured</h1>
          <p className="text-muted-foreground mb-4">Set your brand name, competitors and tracked prompts in Settings → Integrations to start tracking.</p>
          <a href="/settings/integrations" className="text-primary underline text-sm">Go to Brand Tracker setup →</a>
        </div>
      </PageLayout>
    );
  }

  const noRunsYet = runs.length === 0;
  const lastRun = runs[0]?.created_at;

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Radar className="h-6 w-6" /> Brand in AI</h1>
            <p className="text-sm text-muted-foreground">
              How <span className="font-medium text-foreground">{cfg.brand_name}</span> shows up in ChatGPT, Claude and Perplexity vs {cfg.competitors.length} competitor{cfg.competitors.length === 1 ? "" : "s"}.
              {lastRun && <> · Last run {new Date(lastRun).toLocaleString()}</>}
            </p>
          </div>
          <Button onClick={runAll} disabled={running || cfg.prompts.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Running…" : `Run ${cfg.prompts.length} prompt${cfg.prompts.length === 1 ? "" : "s"}`}
          </Button>
        </div>

        {cfg.prompts.length === 0 && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-700 mt-0.5" />
            <div>
              <div className="font-medium text-yellow-900">No prompts set up yet.</div>
              <div className="text-yellow-800">
                Add some in <a className="underline" href="/settings/integrations">Settings → Brand Tracker</a> (or click "Suggest prompts" to auto-generate 6 starter ones).
              </div>
            </div>
          </div>
        )}

        {noRunsYet ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No runs yet. Click <strong>Run {cfg.prompts.length} prompt{cfg.prompts.length === 1 ? "" : "s"}</strong> above to see your first results.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Headline metrics */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Visibility</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold tabular-nums">{fmtPct(visibility, 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{brandHits} of {validRuns.length} responses mention you</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Share of voice</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold tabular-nums">{shareOfVoice[0]?.name === cfg.brand_name ? "#1" : `#${shareOfVoice.findIndex((s) => s.name === cfg.brand_name) + 1}`}</div>
                  <div className="text-xs text-muted-foreground mt-1">of {shareOfVoice.length} tracked brands</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Sentiment</CardTitle></CardHeader>
                <CardContent>
                  <SentimentBreakdown runs={validRuns} />
                </CardContent>
              </Card>
            </div>

            {/* Detection-method comparison */}
            <DetectionMethodBanner runs={validRuns} />

            {/* Visibility by provider + Trend */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Visibility by LLM</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {visibilityByProvider.map((p) => (
                      <div key={p.provider} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium">{p.provider}</span>
                          <span className="tabular-nums text-muted-foreground">{fmtPct(p.visibility, 0)} · {p.runs} runs</span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-violet-500" style={{ width: `${p.visibility * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Visibility trend</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-32">
                    {trend.length >= 2 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                          <Tooltip />
                          <Line type="monotone" dataKey="visibility" stroke="#7c3aed" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Fills in after multiple runs on different days.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Share of voice + Citations */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Share of voice</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={shareOfVoice} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="mentions" fill="#7c3aed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top cited sources</CardTitle></CardHeader>
                <CardContent>
                  {topCitations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No citations extracted yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {topCitations.map(([host, count]) => (
                        <div key={host} className="flex items-center justify-between text-xs">
                          <a href={`https://${host}`} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">{host}</a>
                          <Badge variant="outline" className="text-[10px]">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Per-prompt breakdown with drilldown */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By prompt — click a row to see responses</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {byPrompt.map((p) => (
                    <div key={p.prompt} className="border rounded-md">
                      <button
                        onClick={() => setExpanded(expanded === p.prompt ? null : p.prompt)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30"
                      >
                        {expanded === p.prompt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <span className="flex-1 truncate">{p.prompt}</span>
                        <Badge variant={p.visibility >= 0.5 ? "default" : "outline"} className="text-[10px]">{fmtPct(p.visibility, 0)} hit</Badge>
                        <span className="text-muted-foreground text-[10px]">{p.hits}/{p.total}</span>
                      </button>
                      {expanded === p.prompt && (
                        <div className="border-t bg-muted/10 p-3 space-y-3">
                          {p.runs.map((r) => (
                            <div key={r.id} className="text-xs">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline" className="text-[10px] capitalize">{r.provider}{r.model_tier ? ` · ${r.model_tier}` : ""}</Badge>
                                {r.web_browsing_used && <Badge variant="outline" className="text-[10px] border-blue-300 bg-blue-50 text-blue-700">🌐 browsed</Badge>}
                                {r.mentions_brand ? <Badge className="text-[10px] bg-green-100 text-green-800 hover:bg-green-100">Brand mentioned</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">No brand</Badge>}
                                {r.llm_judge_prominence && <Badge variant="outline" className="text-[10px] capitalize">{r.llm_judge_prominence}</Badge>}
                                {r.llm_judge_sentiment && <Badge variant="outline" className={`text-[10px] capitalize ${r.llm_judge_sentiment === "positive" ? "border-green-300 text-green-700 bg-green-50" : r.llm_judge_sentiment === "negative" ? "border-red-300 text-red-700 bg-red-50" : "border-muted text-muted-foreground"}`}>{r.llm_judge_sentiment}</Badge>}
                                {r.mentions_competitors.length > 0 && <span className="text-[10px] text-muted-foreground">vs {r.mentions_competitors.join(", ")}</span>}
                                <span className="text-[10px] text-muted-foreground ml-auto">run #{r.run_index + 1} · {new Date(r.created_at).toLocaleString()}</span>
                              </div>
                              {r.llm_judge_context && <div className="text-[11px] italic text-muted-foreground mb-1">Judge: "{r.llm_judge_context}"</div>}
                              <details className="text-muted-foreground">
                                <summary className="cursor-pointer hover:text-foreground">View response ({r.response_text?.length || 0} chars)</summary>
                                <div className="mt-1 whitespace-pre-wrap text-foreground bg-background border rounded p-2 max-h-60 overflow-y-auto">{r.response_text || "(empty)"}</div>
                              </details>
                              {r.citations.length > 0 && (
                                <div className="mt-1">
                                  <span className="text-[10px] uppercase text-muted-foreground">Citations:</span>{" "}
                                  {r.citations.slice(0, 8).map((c) => (
                                    <a key={c} href={c} target="_blank" rel="noreferrer" className="text-primary hover:underline mr-2 inline-flex items-center gap-0.5">
                                      {hostname(c)}<ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function SentimentBreakdown({ runs }: { runs: Run[] }) {
  const mentioned = runs.filter((r) => r.mentions_brand);
  const counts = { positive: 0, neutral: 0, negative: 0 };
  let judged = 0;
  for (const r of mentioned) {
    if (r.llm_judge_sentiment) { counts[r.llm_judge_sentiment]++; judged++; }
  }
  if (judged === 0) {
    return <div className="text-xs text-muted-foreground">Turn on "Use LLM-as-judge" in Settings to track sentiment.</div>;
  }
  const total = counts.positive + counts.neutral + counts.negative;
  return (
    <div className="space-y-1.5">
      {(["positive", "neutral", "negative"] as const).map((s) => {
        const pct = total ? counts[s] / total : 0;
        const color = s === "positive" ? "bg-green-500" : s === "negative" ? "bg-red-500" : "bg-muted-foreground/60";
        return (
          <div key={s}>
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize">{s}</span>
              <span className="tabular-nums text-muted-foreground">{counts[s]} · {(pct * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetectionMethodBanner({ runs }: { runs: Run[] }) {
  const judged = runs.filter((r) => r.llm_judge_mentioned !== null);
  if (judged.length === 0) return null;
  const substringMatched = judged.filter((r) => (r.mentions_competitors.length === 0 && r.llm_judge_mentioned !== r.mentions_brand)).length;
  const disagreements = judged.filter((r) => r.llm_judge_mentioned !== null && (r.mentions_brand !== r.llm_judge_mentioned)).length;
  if (disagreements === 0) return null;
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <span className="font-medium text-blue-900">{disagreements} response{disagreements === 1 ? "" : "s"}</span>{" "}
      <span className="text-blue-800">where the LLM judge caught a paraphrased / pronoun mention that the substring matcher missed (or vice-versa). Counts above use the judge's verdict when available.</span>
    </div>
  );
}
