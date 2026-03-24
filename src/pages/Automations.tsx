import { useState, useEffect } from "react";
import { Plus, Play, Pause, Trash2, Edit, Clock, Zap, ChevronRight, Check, Loader2, FileText, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TONE_PRESETS } from "@/lib/tones";

type Automation = {
  id: string;
  name: string;
  cron_expression: string;
  next_run_at: string;
  generate_mode: "ideas_queue" | "custom_prompt";
  funnel_stage_filter: string | null;
  category: string | null;
  tone: string | null;
  article_length: string;
  improve_seo: boolean;
  custom_prompt: string | null;
  prompt_variables: Record<string, string[]>;
  publish_destinations: string[];
  notify_email: string | null;
  is_active: boolean;
  created_at: string;
};

type AutomationRun = {
  id: string;
  run_at: string;
  status: "success" | "failed";
  error_message: string | null;
};

const DESTINATIONS = [
  { id: "library", label: "Library only", always: true },
  { id: "wordpress", label: "WordPress" },
  { id: "notion", label: "Notion" },
  { id: "framer", label: "Framer CMS" },
  { id: "shopify", label: "Shopify" },
  { id: "intercom", label: "Intercom" },
];

function cronToLabel(cron: string): string {
  const parts = cron.split(" ");
  const hour = parseInt(parts[1]) || 9;
  const day = parts[2];
  const dow = parts[4];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const time = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
  if (dow !== "*") return `Every ${days[parseInt(dow)]} at ${time}`;
  if (day !== "*") return `Monthly on day ${day} at ${time}`;
  return `Daily at ${time}`;
}

function buildCron(freq: string, dayOfWeek: string, dayOfMonth: string, hour: number): string {
  if (freq === "daily") return `0 ${hour} * * *`;
  if (freq === "weekly") return `0 ${hour} * * ${dayOfWeek}`;
  return `0 ${hour} ${dayOfMonth} * *`;
}

function nextRunFromCron(cron: string): string {
  const parts = cron.split(" ");
  const hour = parseInt(parts[1]) || 9;
  const day = parts[2];
  const dow = parts[4];
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(hour);
  if (dow !== "*") {
    let daysAhead = parseInt(dow) - next.getDay();
    if (daysAhead <= 0) daysAhead += 7;
    next.setDate(next.getDate() + daysAhead);
  } else if (day !== "*") {
    next.setDate(parseInt(day));
    if (next <= now) next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export default function Automations({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runState, setRunState] = useState<{
    automationId: string;
    automationName: string;
    stage: "triggering" | "generating" | "saving" | "publishing" | "done" | "error";
    articleId: string | null;
    error: string | null;
  } | null>(null);
  const [runs, setRuns] = useState<Record<string, AutomationRun>>({});
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);

  useEffect(() => { if (user) { loadAutomations(); loadConnectedPlatforms(); } }, [user]);

  async function runNow(automationId: string, automationName: string) {
    setRunState({ automationId, automationName, stage: "triggering", articleId: null, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Simulate stage progression for UX
      await new Promise(r => setTimeout(r, 600));
      setRunState(s => s ? { ...s, stage: "generating" } : s);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ automation_id: automationId, time: new Date().toISOString() }),
      });

      setRunState(s => s ? { ...s, stage: "saving" } : s);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      const result = data.results?.[0];
      if (result?.status === "failed") throw new Error(result.error || "Generation failed");

      const articleId = result?.article_id ?? null;

      setRunState(s => s ? { ...s, stage: "publishing" } : s);
      await new Promise(r => setTimeout(r, 500));

      setRunState(s => s ? { ...s, stage: "done", articleId } : s);
      setTimeout(loadAutomations, 1000);
    } catch (e: any) {
      setRunState(s => s ? { ...s, stage: "error", error: e.message } : s);
    }
  }

  async function loadAutomations() {
    setLoading(true);
    const { data } = await supabase.from("automations" as any).select("*").order("created_at", { ascending: false });
    if (data) {
      setAutomations(data as Automation[]);
      // Load last run for each
      const ids = (data as Automation[]).map(a => a.id);
      if (ids.length) {
        const { data: runData } = await supabase
          .from("automation_runs" as any)
          .select("*")
          .in("automation_id", ids)
          .order("run_at", { ascending: false });
        if (runData) {
          const lastRuns: Record<string, AutomationRun> = {};
          for (const r of runData as any[]) {
            if (!lastRuns[r.automation_id]) lastRuns[r.automation_id] = r;
          }
          setRuns(lastRuns);
        }
      }
    }
    setLoading(false);
  }

  async function loadConnectedPlatforms() {
    const { data } = await supabase.from("user_integrations" as any).select("platform");
    if (data) setConnectedPlatforms((data as any[]).map(d => d.platform));
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("automations" as any).update({ is_active: !current }).eq("id", id);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Delete this automation?")) return;
    await supabase.from("automations" as any).delete().eq("id", id);
    setAutomations(prev => prev.filter(a => a.id !== id));
    toast.success("Automation deleted");
  }

  const inner = (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-muted-foreground text-sm mt-1">Schedule automatic content generation from your Ideas queue</p>
        </div>
        <button onClick={() => { setEditingId(null); setShowNew(true); }}
          className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> New Automation
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      ) : automations.length === 0 ? (
        <div className="text-center py-20">
          <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground mb-1">No automations yet</p>
          <p className="text-muted-foreground text-sm mb-6">Create your first to publish content on autopilot.</p>
          <button onClick={() => setShowNew(true)}
            className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-primary/90">
            Create Automation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map(a => {
            const lastRun = runs[a.id];
            return (
              <div key={a.id} className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{a.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {a.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Clock className="w-3 h-3" />
                      <span>{cronToLabel(a.cron_expression)}</span>
                      <span className="mx-1">·</span>
                      <span>{a.generate_mode === "ideas_queue" ? `${a.funnel_stage_filter || "All"} Ideas` : "Custom Prompt"}</span>
                      {a.publish_destinations?.length > 0 && (
                        <>
                          <span className="mx-1">→</span>
                          <span>{a.publish_destinations.join(", ")}</span>
                        </>
                      )}
                    </div>
                    {lastRun && (
                      <div className={`text-xs flex items-center gap-1 ${lastRun.status === "success" ? "text-green-600" : "text-red-500"}`}>
                        {lastRun.status === "success" ? <Check className="w-3 h-3" /> : "✗"}
                        Last run: {new Date(lastRun.run_at).toLocaleDateString()} · {lastRun.status === "success" ? "Success" : lastRun.error_message || "Failed"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => runNow(a.id, a.name)}
                      className="p-1.5 rounded-lg hover:bg-green-50 text-muted-foreground hover:text-green-600 transition-colors" title="Run now">
                      <Zap className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActive(a.id, a.is_active)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" title={a.is_active ? "Pause" : "Resume"}>
                      {a.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setEditingId(a.id); setShowNew(true); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteAutomation(a.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Run Now Progress Modal */}
      <AnimatePresence>
        {runState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{runState.automationName}</div>
                  <div className="text-xs text-muted-foreground">Running automation</div>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                {[
                  { key: "triggering", label: "Triggering automation" },
                  { key: "generating", label: "Generating article with AI" },
                  { key: "saving",     label: "Saving to Library" },
                  { key: "publishing", label: "Publishing to destinations" },
                  { key: "done",       label: "Done!" },
                ].map(({ key, label }) => {
                  const stages = ["triggering","generating","saving","publishing","done"];
                  const currentIdx = stages.indexOf(runState.stage);
                  const thisIdx = stages.indexOf(key);
                  const isDone = runState.stage === "done" ? true : thisIdx < currentIdx;
                  const isActive = thisIdx === currentIdx && runState.stage !== "done";
                  const isPending = thisIdx > currentIdx;
                  return (
                    <div key={key} className={`flex items-center gap-3 text-sm ${isPending ? "opacity-30" : ""}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        isDone ? "bg-green-100" : isActive ? "bg-primary/10" : "bg-muted"
                      }`}>
                        {isDone ? <Check className="w-3 h-3 text-green-600" /> :
                         isActive ? <Loader2 className="w-3 h-3 text-primary animate-spin" /> :
                         <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />}
                      </div>
                      <span className={isDone ? "text-foreground" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {label}
                      </span>
                    </div>
                  );
                })}

                {runState.stage === "error" && (
                  <div className="mt-2 p-3 bg-red-50 rounded-lg text-xs text-red-600">
                    ⚠ {runState.error}
                  </div>
                )}
              </div>

              {runState.stage === "done" ? (
                <div className="flex gap-2">
                  {runState.articleId && (
                    <button
                      onClick={() => { setRunState(null); navigate(`/edit/${runState.articleId}`); }}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90"
                    >
                      <FileText className="w-4 h-4" /> View Article <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => setRunState(null)}
                    className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-secondary">
                    Close
                  </button>
                </div>
              ) : runState.stage === "error" ? (
                <button onClick={() => setRunState(null)}
                  className="w-full py-2.5 text-sm border border-border rounded-lg hover:bg-secondary">
                  Dismiss
                </button>
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  This may take 30–60 seconds…
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNew && (
          <AutomationForm
            editingId={editingId}
            connectedPlatforms={connectedPlatforms}
            onClose={() => { setShowNew(false); setEditingId(null); }}
            onSaved={() => { setShowNew(false); setEditingId(null); loadAutomations(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );

  return embedded ? inner : <PageLayout>{inner}</PageLayout>;
}

function AutomationForm({ editingId, connectedPlatforms, onClose, onSaved }: {
  editingId: string | null;
  connectedPlatforms: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Trigger
  const [name, setName] = useState("My Automation");
  const [frequency, setFrequency] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("1"); // Monday
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [hour, setHour] = useState(9);

  // Step 2: Generate
  const [mode, setMode] = useState<"ideas_queue" | "custom_prompt">("ideas_queue");
  const [funnelStage, setFunnelStage] = useState("all");
  const [category, setCategory] = useState("");
  const [tone, setTone] = useState("");
  const [articleLength, setArticleLength] = useState("medium");
  const [improveSeo, setImproveSeo] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [topicList, setTopicList] = useState("");

  // Step 3: Publish
  const [destinations, setDestinations] = useState<string[]>(["library"]);
  const [notifyEmail, setNotifyEmail] = useState("");

  function toggleDest(id: string) {
    if (id === "library") return; // always on
    setDestinations(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  const cron = buildCron(frequency, dayOfWeek, dayOfMonth, hour);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a name"); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        cron_expression: cron,
        next_run_at: nextRunFromCron(cron),
        generate_mode: mode,
        funnel_stage_filter: funnelStage,
        category: category || null,
        tone: tone || null,
        article_length: articleLength,
        improve_seo: improveSeo,
        custom_prompt: mode === "custom_prompt" ? customPrompt : null,
        prompt_variables: mode === "custom_prompt" && topicList.trim()
          ? { topic: topicList.split("\n").map(t => t.trim()).filter(Boolean) }
          : {},
        publish_destinations: destinations.filter(d => d !== "library"),
        notify_email: notifyEmail.trim() || null,
        is_active: true,
      };

      if (editingId) {
        const { error } = await supabase.from("automations" as any).update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Automation updated");
      } else {
        const { error } = await supabase.from("automations" as any).insert(payload);
        if (error) throw error;
        toast.success("Automation created");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }

  const steps = ["Trigger", "Generate", "Publish"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="font-bold text-lg">{editingId ? "Edit" : "New"} Automation</h2>
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <button onClick={() => setStep(i + 1)}
                  className={`flex items-center gap-1.5 text-sm font-medium ${step === i + 1 ? "text-primary" : step > i + 1 ? "text-green-600" : "text-muted-foreground"}`}>
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${step === i + 1 ? "bg-primary text-white" : step > i + 1 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {step > i + 1 ? "✓" : i + 1}
                  </span>
                  {s}
                </button>
                {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* STEP 1: TRIGGER */}
          {step === 1 && (
            <>
              <div>
                <label className="text-sm font-medium block mb-1">Automation Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Frequency</label>
                <div className="flex gap-2">
                  {["daily", "weekly", "monthly"].map(f => (
                    <button key={f} onClick={() => setFrequency(f)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize ${frequency === f ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {frequency === "weekly" && (
                <div>
                  <label className="text-sm font-medium block mb-2">Day of Week</label>
                  <div className="flex gap-1">
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
                      <button key={d} onClick={() => setDayOfWeek(String(i + 1))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${dayOfWeek === String(i + 1) ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {frequency === "monthly" && (
                <div>
                  <label className="text-sm font-medium block mb-1">Day of Month</label>
                  <input type="number" min="1" max="28" value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
                    className="w-24 border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-1">Time</label>
                <select value={hour} onChange={e => setHour(parseInt(e.target.value))}
                  className="border border-border rounded-lg px-3 py-2 text-sm">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i-12}:00 PM`}</option>
                  ))}
                </select>
              </div>
              <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm text-muted-foreground">
                Will run: <strong className="text-foreground">{cronToLabel(cron)}</strong>
              </div>
            </>
          )}

          {/* STEP 2: GENERATE */}
          {step === 2 && (
            <>
              <div>
                <label className="text-sm font-medium block mb-2">Content Source</label>
                <div className="flex gap-2">
                  <button onClick={() => setMode("ideas_queue")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${mode === "ideas_queue" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                    From Ideas Queue
                  </button>
                  <button onClick={() => setMode("custom_prompt")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium ${mode === "custom_prompt" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                    Custom Prompt
                  </button>
                </div>
              </div>

              {mode === "ideas_queue" && (
                <div>
                  <label className="text-sm font-medium block mb-2">Funnel Stage Filter</label>
                  <div className="flex gap-2">
                    {["all","TOFU","MOFU","BOFU"].map(s => (
                      <button key={s} onClick={() => setFunnelStage(s)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium ${funnelStage === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                        {s === "all" ? "All" : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "custom_prompt" && (
                <>
                  <div>
                    <label className="text-sm font-medium block mb-1">AI Instruction</label>
                    <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={4}
                      placeholder={'Write a {tone} blog post about {topic}. Include the keyword "{keyword}". Minimum 6 sections.'}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                    <p className="text-xs text-muted-foreground mt-1">Use {"{"}<code>topic</code>{"}"}, {"{"}<code>tone</code>{"}"}, {"{"}<code>date</code>{"}"} as placeholders</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Topic Rotation List <span className="font-normal text-muted-foreground">(one per line — rotates each run)</span></label>
                    <textarea value={topicList} onChange={e => setTopicList(e.target.value)} rows={3}
                      placeholder={"AI in education\nLMS best practices\neLearning trends"}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Tone</label>
                  <select value={tone} onChange={e => setTone(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="">Use AI Settings default</option>
                    {TONE_PRESETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Length</label>
                  <select value={articleLength} onChange={e => setArticleLength(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="short">Short (~500w)</option>
                    <option value="medium">Medium (~1000w)</option>
                    <option value="long">Long (~2000w)</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={improveSeo} onChange={e => setImproveSeo(e.target.checked)} className="rounded" />
                <span className="text-sm">Improve SEO after generation</span>
              </label>
            </>
          )}

          {/* STEP 3: PUBLISH */}
          {step === 3 && (
            <>
              <div>
                <label className="text-sm font-medium block mb-2">Publish Destinations</label>
                <div className="space-y-2">
                  {DESTINATIONS.map(d => {
                    const available = d.always || connectedPlatforms.includes(d.id);
                    const selected = destinations.includes(d.id);
                    return (
                      <button key={d.id} onClick={() => available && toggleDest(d.id)} disabled={!available || d.always}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all ${
                          selected ? "border-primary bg-primary/5" : "border-border"
                        } ${!available ? "opacity-40 cursor-not-allowed" : "hover:border-primary/40"}`}>
                        <span className="font-medium">{d.label}</span>
                        <div className="flex items-center gap-2">
                          {!available && <span className="text-xs text-muted-foreground">Not connected</span>}
                          {selected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Email Notification <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input type="email" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary">Back</button>
            )}
            {step < 3 ? (
              <button onClick={() => setStep(s => s + 1)}
                className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90">
                Next
              </button>
            ) : (
              <button onClick={save} disabled={saving}
                className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : editingId ? "Update" : "Create Automation"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
