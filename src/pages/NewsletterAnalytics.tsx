import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, MousePointerClick, Eye, UserMinus, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

interface Schedule {
  id: string;
  subject_line: string;
  sent_at: string | null;
  scheduled_at: string;
  recipient_count: number;
  status: string;
  from_name: string;
}

interface EventSummary {
  opens: number;
  clicks: number;
  unsubscribes: number;
  unique_openers: string[];
  unique_clickers: string[];
}

interface ContactRow {
  email: string;
  opened: boolean;
  clicked: boolean;
  unsubscribed: boolean;
  open_count: number;
  click_count: number;
  clicked_urls: string[];
  last_event: string | null;
}

export default function NewsletterAnalytics() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"email" | "opens" | "clicks">("opens");

  useEffect(() => {
    supabase.from("newsletter_schedules" as any)
      .select("id, subject_line, sent_at, scheduled_at, recipient_count, status, from_name")
      .in("status", ["sent", "sending"])
      .order("scheduled_at", { ascending: false })
      .then(({ data }: any) => {
        if (data) setSchedules(data);
        if (data?.length) setSelectedId(data[0].id);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
  }, [selectedId]);

  async function loadDetail(scheduleId: string) {
    setLoadingDetail(true);
    const { data: events } = await supabase
      .from("newsletter_events" as any)
      .select("*")
      .eq("schedule_id", scheduleId) as any;

    if (!events) { setLoadingDetail(false); return; }

    // Build summary
    const opens = events.filter((e: any) => e.event_type === "open");
    const clicks = events.filter((e: any) => e.event_type === "click");
    const unsubs = events.filter((e: any) => e.event_type === "unsubscribe");

    const sum: EventSummary = {
      opens: opens.length,
      clicks: clicks.length,
      unsubscribes: unsubs.length,
      unique_openers: [...new Set(opens.map((e: any) => e.contact_email))] as string[],
      unique_clickers: [...new Set(clicks.map((e: any) => e.contact_email))] as string[],
    };
    setSummary(sum);

    // Build per-contact rows
    const emailMap = new Map<string, ContactRow>();
    for (const e of events) {
      const row = emailMap.get(e.contact_email) || {
        email: e.contact_email,
        opened: false, clicked: false, unsubscribed: false,
        open_count: 0, click_count: 0,
        clicked_urls: [],
        last_event: null,
      };
      if (e.event_type === "open") { row.opened = true; row.open_count++; }
      if (e.event_type === "click") {
        row.clicked = true; row.click_count++;
        if (e.link_url && !row.clicked_urls.includes(e.link_url)) row.clicked_urls.push(e.link_url);
      }
      if (e.event_type === "unsubscribe") row.unsubscribed = true;
      if (!row.last_event || e.occurred_at > row.last_event) row.last_event = e.occurred_at;
      emailMap.set(e.contact_email, row);
    }

    setContacts(Array.from(emailMap.values()));
    setLoadingDetail(false);
  }

  const schedule = schedules.find(s => s.id === selectedId);
  const recipients = schedule?.recipient_count || 1;

  const sortedContacts = [...contacts].sort((a, b) => {
    if (sortBy === "opens") return b.open_count - a.open_count;
    if (sortBy === "clicks") return b.click_count - a.click_count;
    return a.email.localeCompare(b.email);
  });

  return (
    <PageLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <BarChart2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Newsletter Analytics</h1>
            <p className="text-sm text-muted-foreground">Open rates, clicks, and unsubscribes per contact</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No sent newsletters yet. Send a newsletter to see analytics.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Newsletter picker */}
            <div className="lg:col-span-1 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Campaigns</p>
              {schedules.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${selectedId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 bg-white"}`}
                >
                  <p className="text-xs font-medium truncate">{s.subject_line}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.sent_at ? new Date(s.sent_at).toLocaleDateString() : new Date(s.scheduled_at).toLocaleDateString()}
                    {" · "}{s.recipient_count || 0} sent
                  </p>
                </button>
              ))}
            </div>

            {/* Stats + contact table */}
            <div className="lg:col-span-3 space-y-5">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : summary ? (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={<Mail className="h-4 w-4" />} label="Sent" value={recipients} color="blue" />
                    <StatCard
                      icon={<Eye className="h-4 w-4" />}
                      label="Unique Opens"
                      value={summary.unique_openers.length}
                      sub={`${Math.round(summary.unique_openers.length / recipients * 100)}% open rate`}
                      color="green"
                    />
                    <StatCard
                      icon={<MousePointerClick className="h-4 w-4" />}
                      label="Unique Clicks"
                      value={summary.unique_clickers.length}
                      sub={`${Math.round(summary.unique_clickers.length / recipients * 100)}% CTR`}
                      color="purple"
                    />
                    <StatCard
                      icon={<UserMinus className="h-4 w-4" />}
                      label="Unsubscribes"
                      value={summary.unsubscribes}
                      sub={`${Math.round(summary.unsubscribes / recipients * 100)}% unsub rate`}
                      color="red"
                    />
                  </div>

                  {/* Per-contact table */}
                  <div className="bg-white border border-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <p className="text-sm font-semibold">Per Contact Breakdown</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Sort by:</span>
                        {(["opens", "clicks", "email"] as const).map(s => (
                          <button key={s} onClick={() => setSortBy(s)}
                            className={`px-2 py-0.5 rounded capitalize ${sortBy === s ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {contacts.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        No tracking events yet. Events appear when contacts open or click the newsletter.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {sortedContacts.map(c => (
                          <div key={c.email}>
                            <button
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                              onClick={() => setExpandedEmail(expandedEmail === c.email ? null : c.email)}
                            >
                              {/* Email */}
                              <span className="flex-1 text-sm truncate font-medium">{c.email}</span>

                              {/* Status badges */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.opened ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                  {c.opened ? `✓ ${c.open_count} open${c.open_count > 1 ? "s" : ""}` : "Not opened"}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.clicked ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>
                                  {c.clicked ? `✓ ${c.click_count} click${c.click_count > 1 ? "s" : ""}` : "No clicks"}
                                </span>
                                {c.unsubscribed && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Unsub</span>
                                )}
                              </div>

                              {/* Last activity */}
                              {c.last_event && (
                                <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                                  {new Date(c.last_event).toLocaleDateString()}
                                </span>
                              )}

                              {expandedEmail === c.email
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              }
                            </button>

                            {/* Expanded — clicked URLs */}
                            {expandedEmail === c.email && c.clicked_urls.length > 0 && (
                              <div className="px-4 pb-3 bg-muted/20">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Clicked Links</p>
                                <div className="space-y-1">
                                  {c.clicked_urls.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                      className="block text-xs text-primary hover:underline truncate">
                                      {url}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  Select a campaign to view analytics
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </PageLayout>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; color: "blue" | "green" | "purple" | "red";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
