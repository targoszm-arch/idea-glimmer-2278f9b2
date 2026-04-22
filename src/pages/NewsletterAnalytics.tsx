import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, MousePointerClick, Eye, UserMinus, ChevronDown, ChevronUp, BarChart2, Send } from "lucide-react";

interface Schedule {
  id: string;
  subject_line: string;
  sent_at: string | null;
  scheduled_at: string;
  recipient_count: number;
  status: string;
  from_name: string;
  error_message: string | null;
}

interface ContactRow {
  email: string;
  sent: boolean;
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
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"email" | "opens" | "clicks">("opens");
  const [filter, setFilter] = useState<"all" | "opened" | "clicked" | "unopened">("all");

  useEffect(() => {
    supabase.from("newsletter_schedules" as any)
      .select("id, subject_line, sent_at, scheduled_at, recipient_count, status, from_name, error_message")
      .in("status", ["sent", "sending", "failed"])
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
    setContacts([]);
    const { data: events } = await supabase
      .from("newsletter_events" as any)
      .select("*")
      .eq("schedule_id", scheduleId) as any;

    if (!events) { setLoadingDetail(false); return; }

    // Build per-contact rows from all events
    const emailMap = new Map<string, ContactRow>();

    for (const e of events) {
      if (!e.contact_email || e.contact_email.includes("{{") || e.contact_email.includes("}}")) continue;
      const row = emailMap.get(e.contact_email) || {
        email: e.contact_email,
        sent: false, opened: false, clicked: false, unsubscribed: false,
        open_count: 0, click_count: 0, clicked_urls: [], last_event: null,
      };
      if (e.event_type === "sent") row.sent = true;
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

  const uniqueOpeners = contacts.filter(c => c.opened).length;
  const uniqueClickers = contacts.filter(c => c.clicked).length;
  const unsubscribes = contacts.filter(c => c.unsubscribed).length;
  const totalSent = schedule?.recipient_count || contacts.filter(c => c.sent).length || contacts.length;
  const openRate = totalSent > 0 ? Math.round(uniqueOpeners / totalSent * 100) : 0;
  const ctr = totalSent > 0 ? Math.round(uniqueClickers / totalSent * 100) : 0;

  const filtered = contacts.filter(c => {
    if (filter === "opened") return c.opened;
    if (filter === "clicked") return c.clicked;
    if (filter === "unopened") return !c.opened;
    return true;
  });

  const sortedContacts = [...filtered].sort((a, b) => {
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
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground">Newsletter open rates, clicks, and unsubscribes per contact</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No sent newsletters yet</p>
            <p className="text-sm mt-1">Send a newsletter to see analytics here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Campaign picker */}
            <div className="lg:col-span-1 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Campaigns</p>
              {schedules.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${selectedId === s.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 bg-white"}`}
                >
                  <p className="text-xs font-medium line-clamp-2">{s.subject_line}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {s.sent_at ? new Date(s.sent_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : new Date(s.scheduled_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      s.status === "sent" ? "bg-green-100 text-green-700" :
                      s.status === "failed" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {s.status === "failed" ? "⚠ partial" : s.status}
                    </span>
                    {s.recipient_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">{s.recipient_count.toLocaleString()} recipients</span>
                    )}
                  </div>
                  {s.status === "failed" && s.error_message && (
                    <p className="text-[10px] text-red-600 mt-1 line-clamp-2">{s.error_message}</p>
                  )}
                </button>
              ))}
            </div>

            {/* Stats + contact table */}
            <div className="lg:col-span-3 space-y-5">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={<Send className="h-4 w-4" />} label="Sent" value={totalSent} color="blue" />
                    <StatCard
                      icon={<Eye className="h-4 w-4" />}
                      label="Unique Opens"
                      value={uniqueOpeners}
                      sub={`${openRate}% open rate`}
                      color="green"
                    />
                    <StatCard
                      icon={<MousePointerClick className="h-4 w-4" />}
                      label="Unique Clicks"
                      value={uniqueClickers}
                      sub={`${ctr}% CTR`}
                      color="purple"
                    />
                    <StatCard
                      icon={<UserMinus className="h-4 w-4" />}
                      label="Unsubscribes"
                      value={unsubscribes}
                      sub={totalSent > 0 ? `${Math.round(unsubscribes / totalSent * 100)}% unsub` : ""}
                      color="red"
                    />
                  </div>

                  {/* Contact table */}
                  <div className="bg-white border border-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">Contacts</p>
                        <span className="text-xs text-muted-foreground">({contacts.length} tracked)</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Filter */}
                        <div className="flex gap-1">
                          {(["all", "opened", "clicked", "unopened"] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                              className={`text-[10px] px-2 py-1 rounded-lg capitalize font-medium ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                        {/* Sort */}
                        <div className="flex items-center gap-1 text-xs border-l pl-2">
                          <span className="text-muted-foreground text-[10px]">Sort:</span>
                          {(["opens", "clicks", "email"] as const).map(s => (
                            <button key={s} onClick={() => setSortBy(s)}
                              className={`text-[10px] px-2 py-1 rounded capitalize ${sortBy === s ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {contacts.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">No tracking data yet</p>
                        <p className="text-xs mt-1">Events appear when contacts open, click, or unsubscribe.<br/>Open rates require emails to be opened by recipients.</p>
                      </div>
                    ) : sortedContacts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">No contacts match this filter.</div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {sortedContacts.map(c => (
                          <div key={c.email}>
                            <button
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                              onClick={() => setExpandedEmail(expandedEmail === c.email ? null : c.email)}
                            >
                              {/* Status dot */}
                              <div className={`w-2 h-2 rounded-full shrink-0 ${c.clicked ? "bg-purple-500" : c.opened ? "bg-green-500" : "bg-gray-300"}`} />

                              {/* Email */}
                              <span className="flex-1 text-sm truncate">{c.email}</span>

                              {/* Badges */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {c.opened && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-0.5">
                                    <Eye className="h-2.5 w-2.5" /> {c.open_count}
                                  </span>
                                )}
                                {c.clicked && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 flex items-center gap-0.5">
                                    <MousePointerClick className="h-2.5 w-2.5" /> {c.click_count}
                                  </span>
                                )}
                                {c.unsubscribed && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Unsub</span>
                                )}
                                {!c.opened && !c.clicked && !c.unsubscribed && (
                                  <span className="text-[10px] text-muted-foreground">No activity</span>
                                )}
                              </div>

                              {/* Last activity */}
                              {c.last_event && (
                                <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                                  {new Date(c.last_event).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                                </span>
                              )}

                              {c.clicked_urls.length > 0 && (
                                expandedEmail === c.email
                                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                            </button>

                            {/* Expanded — clicked URLs */}
                            {expandedEmail === c.email && c.clicked_urls.length > 0 && (
                              <div className="px-4 pb-3 pt-1 bg-purple-50/50">
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
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
