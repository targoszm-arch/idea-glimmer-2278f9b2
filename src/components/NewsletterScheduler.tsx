import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Upload, Trash2, Users, Calendar, CheckCircle, XCircle, Clock, Send, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface Contact { id: string; email: string; first_name: string | null; last_name: string | null; }
interface ResendAudience { id: string; name: string; }
interface Schedule {
  id: string; subject_line: string; scheduled_at: string; status: string;
  recipient_count: number; sent_at: string | null; error_message: string | null;
  from_name: string; from_email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  newsletterHtml: string;
  subjectLine: string;
  previewText: string;
  articleId?: string;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

export function NewsletterScheduler({ open, onClose, newsletterHtml, subjectLine, previewText, articleId }: Props) {
  const [tab, setTab] = useState<"schedule" | "contacts" | "history">("schedule");

  // Schedule form
  const [fromName, setFromName] = useState("ContentLab");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [audienceType, setAudienceType] = useState<"contacts" | "resend_list">("contacts");
  const [selectedResendAudience, setSelectedResendAudience] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resend audiences
  const [resendAudiences, setResendAudiences] = useState<ResendAudience[]>([]);
  const [resendContacts, setResendContacts] = useState<{ contacts: any[]; count: number; unsubscribed: number } | null>(null);
  const [loadingResendContacts, setLoadingResendContacts] = useState(false);

  // History
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (open) {
      loadContacts();
      loadResendAudiences();
      loadHistory();
      // Load brand settings to pre-fill form
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase.from("ai_settings" as any).select("newsletter_from_name,newsletter_from_email,newsletter_reply_to").limit(1).maybeSingle().then(({ data }: any) => {
          if (data) {
            if (data.newsletter_from_name) setFromName(data.newsletter_from_name);
            if (data.newsletter_from_email) setFromEmail(data.newsletter_from_email);
            if (data.newsletter_reply_to) setReplyTo(data.newsletter_reply_to);
          }
        });
      });
      // Default scheduled_at to tomorrow 9am
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setScheduledAt(tomorrow.toISOString().slice(0, 16));
    }
  }, [open]);

  async function loadContacts() {
    setLoadingContacts(true);
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/newsletter-audiences?action=contacts`, { headers });
    const data = await res.json();
    setContacts(data.contacts || []);
    setLoadingContacts(false);
  }

  async function loadResendAudiences() {
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/newsletter-audiences?action=resend-lists`, { headers });
    const data = await res.json();
    setResendAudiences(data.audiences || []);
    if (data.error) {
      console.error("Resend audiences error:", data.error);
      toast({ title: "Resend error", description: data.error, variant: "destructive" });
    }
  }

  async function loadResendContacts(audienceId: string) {
    if (!audienceId) { setResendContacts(null); return; }
    setLoadingResendContacts(true);
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/newsletter-audiences?action=resend-contacts&audience_id=${audienceId}`, { headers });
    const data = await res.json();
    setResendContacts(data);
    setLoadingResendContacts(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-newsletter`, { headers });
    const data = await res.json();
    setSchedules(data.schedules || []);
    setLoadingHistory(false);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCsv(true);
    try {
      const text = await file.text();
      // Proper CSV parser that handles quoted fields
      const parseCSV = (csv: string) => {
        const rows: string[][] = [];
        let row: string[] = [];
        let field = "";
        let inQuotes = false;
        for (let i = 0; i < csv.length; i++) {
          const ch = csv[i];
          if (ch === '"') { inQuotes = !inQuotes; }
          else if (ch === ',' && !inQuotes) { row.push(field.trim()); field = ""; }
          else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (field || row.length) { row.push(field.trim()); rows.push(row); }
            row = []; field = "";
            if (ch === '\r' && csv[i + 1] === '\n') i++;
          } else { field += ch; }
        }
        if (field || row.length) { row.push(field.trim()); rows.push(row); }
        return rows;
      };

      const rows = parseCSV(text).filter(r => r.some(c => c));
      if (rows.length < 2) {
        toast({ title: "CSV is empty or has no data rows", variant: "destructive" });
        setUploadingCsv(false);
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/"/g, "").trim());
      const emailIdx = headers.findIndex(h => h.includes("email"));
      const firstIdx = headers.findIndex(h => h.includes("first") || h === "name");
      const lastIdx = headers.findIndex(h => h.includes("last"));

      if (emailIdx === -1) {
        toast({ title: "CSV must have an 'email' column", variant: "destructive" });
        setUploadingCsv(false);
        return;
      }

      const contacts = rows.slice(1).map(cols => ({
        email: (cols[emailIdx] || "").replace(/"/g, "").trim(),
        first_name: firstIdx >= 0 ? (cols[firstIdx] || "").replace(/"/g, "").trim() || null : null,
        last_name: lastIdx >= 0 ? (cols[lastIdx] || "").replace(/"/g, "").trim() || null : null,
      })).filter(c => c.email && c.email.includes("@"));

      if (contacts.length === 0) {
        toast({ title: "No valid email addresses found in CSV", variant: "destructive" });
        setUploadingCsv(false);
        return;
      }

      const authH = await authHeaders();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/newsletter-audiences?action=upload`, {
        method: "POST", headers: authH, body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: `✓ Imported ${data.imported} contacts` });
        loadContacts();
      } else {
        toast({ title: "Import failed", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "CSV parse error", description: String(err), variant: "destructive" });
    }
    setUploadingCsv(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeleteContact(id: string) {
    const headers = await authHeaders();
    await fetch(`${SUPABASE_URL}/functions/v1/newsletter-audiences?action=contact`, {
      method: "DELETE", headers, body: JSON.stringify({ id }),
    });
    setContacts(prev => prev.filter(c => c.id !== id));
  }

  async function handleSchedule() {
    if (!fromEmail) { toast({ title: "From email is required", variant: "destructive" }); return; }
    if (!scheduledAt) { toast({ title: "Schedule date is required", variant: "destructive" }); return; }
    if (audienceType === "contacts" && contacts.length === 0) {
      toast({ title: "No contacts found. Please upload contacts first.", variant: "destructive" }); return;
    }
    if (audienceType === "resend_list" && !selectedResendAudience) {
      toast({ title: "Please select a Resend audience", variant: "destructive" }); return;
    }

    setScheduling(true);
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-newsletter?action=create`, {
      method: "POST", headers,
      body: JSON.stringify({
        article_id: articleId,
        subject_line: subjectLine,
        preview_text: previewText,
        html_content: newsletterHtml,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo || fromEmail,
        audience_type: audienceType,
        resend_audience_id: audienceType === "resend_list" ? selectedResendAudience : null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        recipient_count: audienceType === "resend_list" ? (resendContacts?.count || 0) : contacts.length,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toast({ title: "✓ Newsletter scheduled!", description: `Will send on ${new Date(scheduledAt).toLocaleString()}` });
      loadHistory();
      setTab("history");
    } else {
      toast({ title: "Failed to schedule", description: data.error, variant: "destructive" });
    }
    setScheduling(false);
  }

  async function handleCancel(id: string) {
    const headers = await authHeaders();
    await fetch(`${SUPABASE_URL}/functions/v1/schedule-newsletter?action=cancel`, {
      method: "POST", headers, body: JSON.stringify({ id }),
    });
    loadHistory();
  }

  async function handleSendNow(id: string) {
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-newsletter`, {
      method: "POST", headers, body: JSON.stringify({ schedule_id: id }),
    });
    const data = await res.json();
    if (data.ok) {
      toast({ title: `✓ Sent to ${data.sent} recipients!` });
      loadHistory();
    } else {
      toast({ title: "Send failed", description: data.error, variant: "destructive" });
    }
  }

  const statusIcon = (s: string) => {
    if (s === "sent") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (s === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    if (s === "cancelled") return <XCircle className="h-4 w-4 text-gray-400" />;
    if (s === "sending") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    return <Clock className="h-4 w-4 text-amber-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Newsletter Delivery
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Schedule and send via Resend</p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 flex-shrink-0 border-b border-border pb-3">
          {(["schedule", "contacts", "history"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t} {t === "contacts" && contacts.length > 0 && <span className="ml-1 text-xs opacity-70">({contacts.length})</span>}
              {t === "history" && schedules.length > 0 && <span className="ml-1 text-xs opacity-70">({schedules.length})</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* SCHEDULE TAB */}
          {tab === "schedule" && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium text-foreground">{subjectLine}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{previewText}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">From Name</label>
                  <input value={fromName} onChange={e => setFromName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">From Email *</label>
                  <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="you@yourdomain.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Reply-To (optional)</label>
                <input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="Same as from email"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Audience</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAudienceType("contacts")}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${audienceType === "contacts" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    <Users className="h-4 w-4" />
                    My Contacts ({contacts.length})
                  </button>
                  <button onClick={() => setAudienceType("resend_list")}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${audienceType === "resend_list" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    <Mail className="h-4 w-4" />
                    Resend Audience
                  </button>
                </div>
                {audienceType === "resend_list" && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={selectedResendAudience}
                      onChange={e => { setSelectedResendAudience(e.target.value); loadResendContacts(e.target.value); }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none">
                      <option value="">Select Resend audience...</option>
                      {resendAudiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {resendAudiences.length === 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                        No Resend audiences found. Check that your key is named <strong>RESEND_API_KEY</strong> in Supabase secrets, and that you have created at least one audience at <a href="https://resend.com/audiences" target="_blank" style={{color:"#2563eb"}}>resend.com/audiences</a>.
                      </p>
                    )}
                    {/* Show contacts for selected audience */}
                    {selectedResendAudience && (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience contacts</span>
                          {loadingResendContacts && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          {resendContacts && !loadingResendContacts && (
                            <span className="text-xs text-muted-foreground">
                              {resendContacts.count} active
                              {resendContacts.unsubscribed > 0 && ` · ${resendContacts.unsubscribed} unsubscribed`}
                            </span>
                          )}
                        </div>
                        {resendContacts && resendContacts.contacts.length > 0 && (
                          <div className="max-h-40 overflow-y-auto divide-y divide-border">
                            {resendContacts.contacts.slice(0, 20).map((c: any) => (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 bg-background">
                                <div>
                                  <p className="text-xs text-foreground">{c.email}</p>
                                  {(c.first_name || c.last_name) && (
                                    <p className="text-[10px] text-muted-foreground">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</p>
                                  )}
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.unsubscribed ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                                  {c.unsubscribed ? "unsub" : "active"}
                                </span>
                              </div>
                            ))}
                            {resendContacts.count > 20 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                                +{resendContacts.count - 20} more contacts
                              </div>
                            )}
                          </div>
                        )}
                        {resendContacts && resendContacts.contacts.length === 0 && !loadingResendContacts && (
                          <p className="text-xs text-muted-foreground px-3 py-2">No active contacts in this audience.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {audienceType === "contacts" && contacts.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    No contacts yet. Go to the Contacts tab to upload a CSV.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Schedule Date & Time *</label>
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <Button onClick={handleSchedule} disabled={scheduling} className="w-full">
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
                Schedule Newsletter
              </Button>
            </div>
          )}

          {/* CONTACTS TAB */}
          {tab === "contacts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{contacts.length} contacts</p>
                <div>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingCsv}>
                    {uploadingCsv ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    Upload CSV
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                CSV must have an <strong>email</strong> column. Optional: <strong>first_name</strong>, <strong>last_name</strong>.
              </p>
              {loadingContacts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No contacts yet. Upload a CSV to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {contacts.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-background hover:bg-muted/30">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.email}</p>
                        {(c.first_name || c.last_name) && (
                          <p className="text-xs text-muted-foreground">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</p>
                        )}
                      </div>
                      <button onClick={() => handleDeleteContact(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No scheduled newsletters yet.</p>
                </div>
              ) : schedules.map(s => (
                <div key={s.id} className="rounded-lg border border-border p-4 bg-background">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(s.status)}
                        <span className="text-sm font-medium text-foreground truncate">{s.subject_line}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s.status === "sent"
                          ? `Sent ${new Date(s.sent_at!).toLocaleString()} · ${s.recipient_count} recipients`
                          : s.status === "scheduled"
                          ? `Scheduled for ${new Date(s.scheduled_at).toLocaleString()} · ${s.recipient_count} recipients`
                          : s.status === "failed"
                          ? `Failed: ${s.error_message}`
                          : s.status}
                      </p>
                      <p className="text-xs text-muted-foreground">From: {s.from_name} &lt;{s.from_email}&gt;</p>
                    </div>
                    {s.status === "scheduled" && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => handleSendNow(s.id)}>
                          <Send className="h-3 w-3 mr-1" /> Send Now
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-destructive" onClick={() => handleCancel(s.id)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
