import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Play, Pause, Trash2, Edit, Clock, Zap, Check, Loader2, FileText, ArrowRight, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TONE_PRESETS } from "@/lib/tones";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  automation_id: string;
  run_at: string;
  status: "success" | "failed";
  error_message: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DESTINATIONS = [
  { id: "library", label: "Library only", always: true },
  { id: "wordpress", label: "WordPress" },
  { id: "notion", label: "Notion" },
  { id: "framer", label: "Framer CMS" },
  { id: "shopify", label: "Shopify" },
  { id: "intercom", label: "Intercom" },
];

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function cronToLabel(cron: string): string {
  const parts = cron.split(" ");
  const hour = parseInt(parts[1]) || 9;
  const day = parts[2];
  const dow = parts[4];
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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

/** Returns every date in the given month+year that an automation is scheduled to run */
function getScheduledDaysInMonth(automations: Automation[], year: number, month: number): Map<number, Automation[]> {
  const result = new Map<number, Automation[]>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (const a of automations) {
    if (!a.is_active) continue;
    const parts = a.cron_expression.split(" ");
    const day = parts[2];
    const dow = parts[4];

    if (dow !== "*") {
      // Weekly — find all matching weekdays
      const targetDow = parseInt(dow);
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (date.getDay() === targetDow) {
          const arr = result.get(d) || [];
          arr.push(a);
          result.set(d, arr);
        }
      }
    } else if (day !== "*") {
      // Monthly
      const d = parseInt(day);
      if (d <= daysInMonth) {
        const arr = result.get(d) || [];
        arr.push(a);
        result.set(d, arr);
      }
    } else {
      // Daily — every day
      for (let d = 1; d <= daysInMonth; d++) {
        const arr = result.get(d) || [];
        arr.push(a);
        result.set(d, arr);
      }
    }
  }
  return result;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [newsletterSchedules, setNewsletterSchedules] = useState<any[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [runState, setRunState] = useState<{
    automationId: string;
    automationName: string;
    stage: "triggering" | "generating" | "saving" | "publishing" | "done" | "error";
    articleId: string | null;
    error: string | null;
  } | null>(null);

  const [previewArticle, setPreviewArticle] = useState<{
    id: string; title: string; content: string;
    cover_image_url: string | null; automation: Automation;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) { loadAll(); loadConnectedPlatforms(); }
    else setLoading(false);
  }, [user, authLoading]);

  async function loadAll() {
    setLoading(true);
    const [{ data: aData }, { data: rData }, { data: spData }, { data: nlData }] = await Promise.all([
      supabase.from("automations" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("automation_runs" as any).select("*").order("run_at", { ascending: false }).limit(200),
      supabase.from("social_posts" as any).select("*").not("scheduled_at", "is", null).order("scheduled_at", { ascending: true }),
      supabase.from("newsletter_schedules" as any).select("*").order("scheduled_at", { ascending: true }),
    ]);
    if (aData) setAutomations(aData as unknown as Automation[]);
    if (rData) setRuns(rData as unknown as AutomationRun[]);
    if (spData) setScheduledPosts(spData as any[]);
    if (nlData) setNewsletterSchedules(nlData as any[]);
    setLoading(false);
  }

  async function loadConnectedPlatforms() {
    const { data } = await supabase.from("user_integrations" as any).select("platform");
    if (data) setConnectedPlatforms((data as any[]).map(d => d.platform));
  }

  // Calendar computed values
  const scheduledDays = useMemo(
    () => getScheduledDaysInMonth(automations, calYear, calMonth),
    [automations, calYear, calMonth]
  );

  // Past runs in this month indexed by day
  const pastRunsByDay = useMemo(() => {
    const map = new Map<number, AutomationRun[]>();
    for (const r of runs) {
      const d = new Date(r.run_at);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        const arr = map.get(day) || [];
        arr.push(r);
        map.set(day, arr);
      }
    }
    return map;
  }, [runs, calYear, calMonth]);

  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
    setSelectedDay(null);
  }

  const selectedDayAutomations = selectedDay ? (scheduledDays.get(selectedDay) || []) : [];
  const selectedDayRuns = selectedDay ? (pastRunsByDay.get(selectedDay) || []) : [];
  const selectedDayNewsletters = selectedDay ? newsletterSchedules.filter(n => {
    const d = new Date(n.scheduled_at);
    return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay;
  }) : [];

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

  async function runNow(automationId: string, automationName: string) {
    setRunState({ automationId, automationName, stage: "triggering", articleId: null, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await new Promise(r => setTimeout(r, 600));
      setRunState(s => s ? { ...s, stage: "generating" } : s);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo" },
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
      setTimeout(loadAll, 1000);
      const automation = automations.find(a => a.id === automationId);
      if (articleId && (automation as any)?.preview_before_publish) {
        const { data: art } = await supabase.from("articles" as any).select("id,title,content,cover_image_url").eq("id", articleId).single();
        if (art && automation) {
          setTimeout(() => {
            setRunState(null);
            setPreviewArticle({ id: (art as any).id, title: (art as any).title, content: (art as any).content, cover_image_url: (art as any).cover_image_url, automation });
          }, 800);
        }
      }
    } catch (e: any) {
      setRunState(s => s ? { ...s, stage: "error", error: e.message } : s);
    }
  }

  async function publishPreviewArticle() {
    if (!previewArticle) return;
    setPublishing(true);
    try {
      await supabase.from("articles" as any).update({ status: "published" }).eq("id", previewArticle.id);
      const { data: { session } } = await supabase.auth.getSession();
      for (const dest of previewArticle.automation.publish_destinations || []) {
        try {
          if (dest === "wordpress") {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo" },
              body: JSON.stringify({ action: "publish", article_id: previewArticle.id }),
            });
          } else if (dest === "framer") {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-framer`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo" },
              body: JSON.stringify({ article_id: previewArticle.id, title: previewArticle.title }),
            });
          }
        } catch {}
      }
      toast.success("Article approved and published!");
      setPreviewArticle(null);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    setPublishing(false);
  }

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Content Calendar</h1>
            <p className="text-muted-foreground text-sm mt-1">Schedule and manage your automated content publishing</p>
          </div>
          <button
            onClick={() => { setEditingId(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Automation
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Calendar ── */}
          <div className="lg:col-span-2 bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Month nav */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="font-semibold text-base">{MONTH_NAMES[calMonth]} {calYear}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border/50 bg-muted/20" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = isCurrentMonth && today.getDate() === day;
                const scheduled = scheduledDays.get(day) || [];
                const pastRuns = pastRunsByDay.get(day) || [];
                const isSelected = selectedDay === day;
                const isPast = new Date(calYear, calMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dayNewsletters = newsletterSchedules.filter(n => {
                  const d = new Date(n.scheduled_at);
                  return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day;
                });

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`min-h-[80px] border-b border-r border-border/50 p-1.5 text-left transition-colors relative
                      ${isSelected ? "bg-primary/5 border-primary/30" : "hover:bg-muted/30"}
                      ${isPast && !isToday ? "opacity-70" : ""}
                    `}
                  >
                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${isToday ? "bg-primary text-white" : "text-foreground"}`}>
                      {day}
                    </span>

                    {/* Scheduled automation dots */}
                    <div className="space-y-0.5">
                      {scheduled.slice(0, 2).map(a => (
                        <div key={a.id} className="text-[10px] leading-tight bg-blue-100 text-blue-700 rounded px-1 truncate">
                          {a.name}
                        </div>
                      ))}
                      {scheduled.length > 2 && (
                        <div className="text-[10px] text-muted-foreground">+{scheduled.length - 2} more</div>
                      )}
                      {/* Newsletter dots */}
                      {dayNewsletters.slice(0, 1).map(n => (
                        <div key={n.id} className="text-[10px] leading-tight bg-purple-100 text-purple-700 rounded px-1 truncate flex items-center gap-0.5">
                          ✉ {n.subject_line}
                        </div>
                      ))}
                      {dayNewsletters.length > 1 && (
                        <div className="text-[10px] text-muted-foreground">+{dayNewsletters.length - 1} newsletter</div>
                      )}
                    </div>

                    {/* Past run indicators */}
                    {pastRuns.length > 0 && (
                      <div className="absolute top-1 right-1 flex gap-0.5">
                        {pastRuns.slice(0, 3).map(r => (
                          <div key={r.id} className={`w-1.5 h-1.5 rounded-full ${r.status === "success" ? "bg-green-500" : "bg-red-400"}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-6 py-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100" /> Scheduled</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-100" /> Newsletter</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Ran successfully</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Failed</span>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="space-y-4">

            {/* Selected day detail */}
            {selectedDay && (
              <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  {MONTH_NAMES[calMonth]} {selectedDay}
                </h3>

                {selectedDayAutomations.length === 0 && selectedDayRuns.length === 0 && selectedDayNewsletters.length === 0 && (
                  <p className="text-xs text-muted-foreground">No automations scheduled for this day.</p>
                )}

                {selectedDayAutomations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Scheduled</p>
                    <div className="space-y-1.5">
                      {selectedDayAutomations.map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-xs font-medium text-blue-800">{a.name}</p>
                            <p className="text-[10px] text-blue-600">{cronToLabel(a.cron_expression)}</p>
                          </div>
                          <button onClick={() => runNow(a.id, a.name)} className="p-1 rounded hover:bg-blue-100 text-blue-600" title="Run now">
                            <Zap className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDayRuns.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Past Runs</p>
                    <div className="space-y-1">
                      {selectedDayRuns.map(r => {
                        const auto = automations.find(a => a.id === r.automation_id);
                        return (
                          <div key={r.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg
                            ${r.status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                            {r.status === "success" ? <Check className="w-3 h-3 shrink-0" /> : <span className="text-xs">✗</span>}
                            <span className="truncate">{auto?.name || "Automation"}</span>
                            <span className="text-[10px] opacity-70 ml-auto shrink-0">
                              {new Date(r.run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedDayNewsletters.length > 0 && (
                  <div className={selectedDayRuns.length > 0 || selectedDayAutomations.length > 0 ? "mt-3" : ""}>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">📧 Newsletters</p>
                    <div className="space-y-1.5">
                      {selectedDayNewsletters.map(n => (
                        <div key={n.id} className="flex items-center justify-between bg-purple-50 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-purple-800 truncate">{n.subject_line}</p>
                            <p className="text-[10px] text-purple-600">
                              {new Date(n.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {" · "}{n.status}
                              {n.recipient_count ? ` · ${n.recipient_count} recipients` : ""}
                            </p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                            n.status === "sent" ? "bg-green-100 text-green-700" :
                            n.status === "scheduled" ? "bg-purple-100 text-purple-700" :
                            n.status === "failed" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{n.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Automations list */}
            <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-sm">Automations</h3>
                <span className="text-xs text-muted-foreground">{automations.length} total</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : automations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No automations yet</p>
                  <button onClick={() => setShowForm(true)}
                    className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90">
                    Create First Automation
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {automations.map(a => (
                    <div key={a.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-medium truncate">{a.name}</span>
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium
                              ${a.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {a.is_active ? "Active" : "Paused"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{cronToLabel(a.cron_expression)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => runNow(a.id, a.name)} className="p-1 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600" title="Run now">
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => toggleActive(a.id, a.is_active)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                            {a.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => { setEditingId(a.id); setShowForm(true); }} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteAutomation(a.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Run Progress Modal ── */}
        <AnimatePresence>
          {runState && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
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
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isDone ? "bg-green-100" : isActive ? "bg-primary/10" : "bg-muted"}`}>
                          {isDone ? <Check className="w-3 h-3 text-green-600" /> :
                           isActive ? <Loader2 className="w-3 h-3 text-primary animate-spin" /> :
                           <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />}
                        </div>
                        <span className={isDone ? "text-foreground" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}>{label}</span>
                      </div>
                    );
                  })}
                  {runState.stage === "error" && (
                    <div className="mt-2 p-3 bg-red-50 rounded-lg text-xs text-red-600">⚠ {runState.error}</div>
                  )}
                </div>
                {runState.stage === "done" ? (
                  <div className="flex gap-2">
                    {runState.articleId && (
                      <button onClick={() => { setRunState(null); navigate(`/edit/${runState.articleId}`); }}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90">
                        <FileText className="w-4 h-4" /> View Article <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => setRunState(null)} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-secondary">Close</button>
                  </div>
                ) : runState.stage === "error" ? (
                  <button onClick={() => setRunState(null)} className="w-full py-2.5 text-sm border border-border rounded-lg hover:bg-secondary">Dismiss</button>
                ) : (
                  <div className="text-center text-xs text-muted-foreground">This may take 30–60 seconds…</div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Article Preview Modal ── */}
        <AnimatePresence>
          {previewArticle && (
            <div className="fixed inset-0 z-50 flex flex-col bg-white">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div>
                  <h2 className="font-bold text-lg">Preview Article</h2>
                  <p className="text-xs text-muted-foreground">Review before publishing to {previewArticle.automation.publish_destinations?.join(", ") || "Library"}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => supabase.from("articles" as any).delete().eq("id", previewArticle.id).then(() => { setPreviewArticle(null); toast.success("Discarded."); })}
                    className="px-4 py-2 text-sm border border-border rounded-lg text-destructive hover:bg-red-50">🗑 Discard</button>
                  <button onClick={() => { setPreviewArticle(null); navigate(`/edit/${previewArticle.id}`); }}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary">✏️ Edit</button>
                  <button onClick={publishPreviewArticle} disabled={publishing}
                    className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                    {publishing ? <><Loader2 className="w-4 h-4 animate-spin" />Publishing…</> : "✓ Approve & Publish"}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 py-8">
                  {previewArticle.cover_image_url && (
                    <img src={previewArticle.cover_image_url} alt={previewArticle.title} className="w-full h-64 object-cover rounded-xl mb-8" />
                  )}
                  <h1 className="text-4xl font-bold mb-6 text-foreground">{previewArticle.title}</h1>
                  <article className="prose prose-sm sm:prose max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: previewArticle.content }} />
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Automation Form ── */}
        <AnimatePresence>
          {showForm && (
            <AutomationForm
              editingId={editingId}
              connectedPlatforms={connectedPlatforms}
              onClose={() => { setShowForm(false); setEditingId(null); }}
              onSaved={() => { setShowForm(false); setEditingId(null); loadAll(); }}
            />
          )}
        </AnimatePresence>

      </div>
    </PageLayout>
  );
}

// ─── Automation Form (unchanged from original) ────────────────────────────────

function AutomationForm({ editingId, connectedPlatforms, onClose, onSaved }: {
  editingId: string | null;
  connectedPlatforms: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [automationType, setAutomationType] = useState<"article" | "newsletter">("article");
  const [newsletterArticleId, setNewsletterArticleId] = useState<string>("");
  const [newsletterArticles, setNewsletterArticles] = useState<{ id: string; title: string; newsletter_data: any }[]>([]);
  const [newsletterAudienceType, setNewsletterAudienceType] = useState<"contacts" | "resend_list">("contacts");
  const [newsletterResendAudienceId, setNewsletterResendAudienceId] = useState<string>("");
  const [resendAudiences, setResendAudiences] = useState<{ id: string; name: string }[]>([]);

  // Load articles with newsletter data + resend audiences
  useEffect(() => {
    if (automationType === "newsletter") {
      supabase.from("articles" as any).select("id, title, newsletter_data").eq("status", "published").order("updated_at", { ascending: false }).limit(50).then(({ data }: any) => {
        if (data) setNewsletterArticles(data.filter((a: any) => a.newsletter_data));
      });
      const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-audiences?action=resend-lists`, {
          headers: { Authorization: `Bearer ${session?.access_token}`, apikey: ANON_KEY }
        }).then(r => r.json()).then(d => { if (d.audiences) setResendAudiences(d.audiences); });
      });
    }
  }, [automationType]);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("My Automation");
  const [frequency, setFrequency] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [hour, setHour] = useState(9);
  const [mode, setMode] = useState<"ideas_queue" | "custom_prompt">("ideas_queue");
  const [funnelStage, setFunnelStage] = useState("all");
  const [tone, setTone] = useState("");
  const [articleLength, setArticleLength] = useState("medium");
  const [improveSeo, setImproveSeo] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [topicList, setTopicList] = useState("");
  const [destinations, setDestinations] = useState<string[]>(["library"]);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [previewBeforePublish, setPreviewBeforePublish] = useState(false);

  // Load existing automation when editing
  useEffect(() => {
    if (!editingId) return;
    supabase.from("automations" as any).select("*").eq("id", editingId).single().then(({ data }) => {
      if (!data) return;
      const a = data as unknown as Automation;
      setName(a.name);
      const parts = a.cron_expression.split(" ");
      setHour(parseInt(parts[1]) || 9);
      if (parts[4] !== "*") { setFrequency("weekly"); setDayOfWeek(parts[4]); }
      else if (parts[2] !== "*") { setFrequency("monthly"); setDayOfMonth(parts[2]); }
      else setFrequency("daily");
      // Load automation type + newsletter fields
      const aType = (a as any).automation_type || "article";
      setAutomationType(aType);
      if (aType === "newsletter") {
        setNewsletterArticleId((a as any).newsletter_article_id || "");
        setNewsletterAudienceType((a as any).newsletter_audience_type || "contacts");
        setNewsletterResendAudienceId((a as any).newsletter_resend_audience_id || "");
      }
      setMode(a.generate_mode);
      setFunnelStage(a.funnel_stage_filter || "all");
      setTone(a.tone || "");
      setArticleLength(a.article_length);
      setImproveSeo(a.improve_seo);
      setCustomPrompt(a.custom_prompt || "");
      setTopicList(a.prompt_variables?.topic?.join("\n") || "");
      setDestinations(["library", ...((a.publish_destinations || []).filter(d => d !== "library"))]);
      setNotifyEmail(a.notify_email || "");
      setPreviewBeforePublish((a as any).preview_before_publish || false);
    });
  }, [editingId]);

  function toggleDest(id: string) {
    if (id === "library") return;
    setDestinations(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  const cron = buildCron(frequency, dayOfWeek, dayOfMonth, hour);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a name"); return; }
    if (automationType === "newsletter" && !newsletterArticleId) { toast.error("Please select a newsletter article"); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(), cron_expression: cron, next_run_at: nextRunFromCron(cron),
        automation_type: automationType,
        ...(automationType === "newsletter" ? {
          newsletter_article_id: newsletterArticleId,
          newsletter_audience_type: newsletterAudienceType,
          newsletter_resend_audience_id: newsletterAudienceType === "resend_list" ? newsletterResendAudienceId : null,
          generate_mode: "custom_prompt",
          article_length: "medium",
          improve_seo: false,
          publish_destinations: [],
        } : {
          generate_mode: mode, funnel_stage_filter: funnelStage, tone: tone || null,
          article_length: articleLength, improve_seo: improveSeo,
          custom_prompt: mode === "custom_prompt" ? customPrompt : null,
          prompt_variables: mode === "custom_prompt" && topicList.trim()
            ? { topic: topicList.split("\n").map(t => t.trim()).filter(Boolean) } : {},
          publish_destinations: destinations.filter(d => d !== "library"),
          notify_email: notifyEmail.trim() || null,
          preview_before_publish: previewBeforePublish,
        }),
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
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  }

  const steps = automationType === "newsletter" ? ["Trigger"] : ["Trigger", "Generate", "Publish"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
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
          {step === 1 && (
            <>
              <div>
                <label className="text-sm font-medium block mb-2">Automation Type</label>
                <div className="flex gap-2">
                  <button onClick={() => setAutomationType("article")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 ${automationType === "article" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    <FileText className="w-4 h-4" /> Article
                  </button>
                  <button onClick={() => setAutomationType("newsletter")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 ${automationType === "newsletter" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    ✉️ Newsletter
                  </button>
                </div>
              </div>

              {automationType === "newsletter" && (
                <div className="space-y-4 bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <div>
                    <label className="text-sm font-medium block mb-1">Newsletter Article</label>
                    <select value={newsletterArticleId} onChange={e => setNewsletterArticleId(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">— Select an article —</option>
                      {newsletterArticles.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    {newsletterArticles.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">No articles with newsletters yet. Generate a newsletter from an article first.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Audience</label>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setNewsletterAudienceType("contacts")}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium ${newsletterAudienceType === "contacts" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                        My Contacts
                      </button>
                      <button onClick={() => setNewsletterAudienceType("resend_list")}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium ${newsletterAudienceType === "resend_list" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                        Resend Audience
                      </button>
                    </div>
                    {newsletterAudienceType === "resend_list" && (
                      <select value={newsletterResendAudienceId} onChange={e => setNewsletterResendAudienceId(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="">— Select audience —</option>
                        {resendAudiences.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium block mb-1">Automation Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Frequency</label>
                <div className="flex gap-2">
                  {["daily","weekly","monthly"].map(f => (
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
                <select value={hour} onChange={e => setHour(parseInt(e.target.value))} className="border border-border rounded-lg px-3 py-2 text-sm">
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
                      placeholder={'Write a {tone} blog post about {topic}.'}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Topic Rotation List</label>
                    <textarea value={topicList} onChange={e => setTopicList(e.target.value)} rows={3}
                      placeholder={"AI in education\nLMS best practices\neLearning trends"}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Tone</label>
                  <select value={tone} onChange={e => setTone(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="">Use AI Settings default</option>
                    {TONE_PRESETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Length</label>
                  <select value={articleLength} onChange={e => setArticleLength(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
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
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all
                          ${selected ? "border-primary bg-primary/5" : "border-border"}
                          ${!available ? "opacity-40 cursor-not-allowed" : "hover:border-primary/40"}`}>
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
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-border hover:border-primary/40 transition-colors">
                <input type="checkbox" checked={previewBeforePublish} onChange={e => setPreviewBeforePublish(e.target.checked)} className="rounded w-4 h-4" />
                <div>
                  <div className="text-sm font-medium">Preview before publishing</div>
                  <div className="text-xs text-muted-foreground">Review and approve each article before it goes live</div>
                </div>
              </label>
              <div>
                <label className="text-sm font-medium block mb-1">Email Notification <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input type="email" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="you@example.com" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary">Back</button>
            )}
            {step < steps.length ? (
              <button onClick={() => setStep(s => s + 1)} className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Next</button>
            ) : (
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : editingId ? "Update" : "Create Automation"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
