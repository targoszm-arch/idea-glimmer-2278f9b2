import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Download, Mail, RefreshCw, Check, Send, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NewsletterScheduler } from "@/components/NewsletterScheduler";
import { supabase } from "@/integrations/supabase/client";

interface NewsletterData {
  subject_line: string;
  preview_text: string;
  greeting: string;
  opening_hook: string;
  sections: { heading: string; body: string; bullets?: string[] }[];
  what_this_means: string;
  cta_text: string;
  cta_url?: string;
  closing: string;
  signoff: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  article: {
    title: string;
    content: string;
    excerpt: string;
    category: string;
    cover_image_url?: string | null;
    id?: string;
    slug?: string;
    url_path?: string | null;
  };
  brandName?: string;
  brandLogoUrl?: string;
  ctaUrl?: string;
}

export function NewsletterEditor({ open, onClose, article, brandName, brandLogoUrl, ctaUrl }: Props) {
  const [newsletter, setNewsletter] = useState<NewsletterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "edit" | "html">("preview");
  const [showScheduler, setShowScheduler] = useState(false);
  const [articleSlug, setArticleSlug] = useState<string>(article.slug || "");
  // url_path encodes the article's actual category + slug in the shape the
  // live site serves it (e.g. "getting-started/<slug>",
  // "instructional-design/<slug>"). Previously the newsletter CTA was
  // hardcoded to "/latest-articles/<slug>" which 404s for 115/116 articles.
  const [articleUrlPath, setArticleUrlPath] = useState<string>(article.url_path || "");
  const [brandSettings, setBrandSettings] = useState({
    fromName: brandName || "",
    fromEmail: "",
    replyTo: "",
    footerText: "",
    logoUrl: brandLogoUrl || "",
    websiteUrl: ctaUrl || "",
  });

  // Load brand settings + saved newsletter (or generate fresh) on open
  React.useEffect(() => {
    if (!open) return;

    // Load brand settings + fallback logo from brand_assets
    supabase.from("ai_settings" as any).select("newsletter_from_name,newsletter_from_email,newsletter_reply_to,newsletter_footer_text,newsletter_brand_logo_url,newsletter_website_url").limit(1).maybeSingle().then(async ({ data }: any) => {
      let logoUrl = data?.newsletter_brand_logo_url || brandLogoUrl || "";

      // If no logo set in newsletter settings, grab first logo from brand_assets
      if (!logoUrl) {
        const { data: logoAsset } = await supabase
          .from("brand_assets" as any)
          .select("file_url, name")
          .eq("type", "logo")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (logoAsset) logoUrl = (logoAsset as any).file_url || "";
      }

      if (data) setBrandSettings({
        fromName: data.newsletter_from_name || brandName || "",
        fromEmail: data.newsletter_from_email || "",
        replyTo: data.newsletter_reply_to || "",
        footerText: data.newsletter_footer_text || "",
        logoUrl,
        websiteUrl: data.newsletter_website_url || ctaUrl || "",
      });
      else if (logoUrl) setBrandSettings(prev => ({ ...prev, logoUrl }));
    });

    // Load real slug + url_path from DB if we have an article id
    if (article.id) {
      supabase.from("articles").select("slug, url_path").eq("id", article.id).maybeSingle().then(({ data }: any) => {
        if (data?.slug) setArticleSlug(data.slug);
        if (data?.url_path) setArticleUrlPath(data.url_path);
      });
    }
    if (article.id) {
      supabase.from("articles").select("newsletter_data").eq("id", article.id).maybeSingle().then(({ data }: any) => {
        if (data?.newsletter_data) {
          const saved = data.newsletter_data as NewsletterData;
          // Ensure cta_url is set — fallback to articleUrl if missing
          setNewsletter({ ...saved, cta_url: saved.cta_url || articleUrl });
        } else {
          generate();
        }
      });
    } else {
      // No article ID yet (new article not saved), generate fresh
      generate();
    }
  }, [open]);

  // Build article URL — recomputes when brandSettings loads or slug / url_path
  // is fetched from DB. Prefer the stored `url_path` (which already encodes
  // the correct category/slug, e.g. "getting-started/<slug>") over a
  // hardcoded "/latest-articles/<slug>" prefix that only matches 1/116
  // articles. Fall back to the bare slug for legacy rows missing url_path.
  const articleUrl = React.useMemo(() => {
    const websiteBase = brandSettings.websiteUrl || ctaUrl || "";
    if (!websiteBase) return "";
    const base = websiteBase.replace(/\/$/, "");
    const path = (articleUrlPath || article.url_path || articleSlug || article.slug || "").replace(/^\/+/, "");
    if (path) return `${base}/${path}`;
    return base;
  }, [brandSettings.websiteUrl, articleUrlPath, article.url_path, articleSlug, article.slug, ctaUrl]);

  const generate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo",
        },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          excerpt: article.excerpt,
          category: article.category,
          cover_image_url: article.cover_image_url,
          cta_text: "Read the full article",
          cta_url: articleUrl,
          brand_name: brandSettings.fromName || brandName,
          brand_logo_url: brandSettings.logoUrl || brandLogoUrl,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewsletter({ ...data.newsletter, cta_url: data.newsletter.cta_url || articleUrl });
        // Save to DB so it loads instantly next time
        if (article.id) {
          supabase.from("articles").update({ newsletter_data: data.newsletter } as any).eq("id", article.id).then(() => {});
        }
      } else {
        toast({ title: "Failed to generate newsletter", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  const buildHtml = (n: NewsletterData) => {
    const logo = brandSettings.logoUrl || brandLogoUrl || "";
    const footerName = brandSettings.fromName || brandName || "";
    const footerText = brandSettings.footerText || `© ${footerName}. All Rights Reserved.`;
    const cta = n.cta_url || articleUrl;
    // Article deep link — use articleUrl if available, otherwise cta_url as fallback
    const articleLink = articleUrl || n.cta_url || "";
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>${n.subject_line}</title>
</head>
<body style="width:100%;background-color:#f0f1f5;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5">
<tbody><tr><td>
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
<tbody>
<!-- LOGO -->
${logo ? `<tr><td style="padding:24px 24px 0 24px;text-align:center;"><img src="${logo}" height="50" style="height:50px;width:auto;" /></td></tr>` : ""}
<!-- COVER IMAGE -->
${article.cover_image_url ? `<tr><td style="padding:16px 0 0 0;"><img src="${article.cover_image_url}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>` : ""}
<!-- TITLE -->
<tr><td style="padding:24px 24px 0 24px;color:#0f171f;font-size:24px;font-weight:700;">${article.title}</td></tr>
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
<!-- GREETING -->
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;">${n.greeting}</td></tr>
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
<!-- HOOK -->
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;line-height:1.6;">${n.opening_hook}</td></tr>
<tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>
<!-- SECTIONS -->
${n.sections.map(s => `
<tr><td style="padding:0 24px;color:#0f171f;font-size:18px;font-weight:600;">${s.heading}</td></tr>
<tr><td style="height:8px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;line-height:1.6;">${s.body}</td></tr>
${s.bullets && s.bullets.length > 0 ? `
<tr><td style="height:8px;font-size:0;">&nbsp;</td></tr>
${s.bullets.map(b => `
<tr><td style="padding:0 24px;font-size:0;">
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
<td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap;"><span style="font-size:16px;color:#0f171f;">•</span></td>
<td style="font-size:16px;color:#0f171f;line-height:1.6;">${b}</td>
</tr></tbody></table>
</td></tr>`).join("")}` : ""}
<tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>
`).join("")}
<!-- WHAT THIS MEANS -->
<tr><td style="padding:16px 24px;background-color:#f0f4ff;border-left:4px solid #4a53fa;">
<p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#4a53fa;text-transform:uppercase;letter-spacing:0.05em;">WHAT THIS MEANS FOR YOU</p>
<p style="margin:0;font-size:15px;color:#0f171f;line-height:1.6;">${n.what_this_means}</p>
</td></tr>
<tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>
<!-- READ FULL ARTICLE LINK -->
${articleLink ? `<tr><td style="padding:0 24px 16px 24px;text-align:center;">
<a href="${articleLink}" target="_blank" style="color:#0c61e9;font-size:14px;font-weight:600;text-decoration:underline;">Read the full article →</a>
</td></tr>` : ""}
<!-- CTA BUTTON -->
<tr><td style="padding:0 24px;text-align:center;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tbody><tr><td style="background-color:#0c61e9;border-radius:100px;padding:14px 32px;">
<a href="${cta || "#"}" target="_blank" style="color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${n.cta_text || "Read the full article"}</a>
</td></tr></tbody></table>
</td></tr>
<tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>
<!-- CLOSING -->
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;line-height:1.6;">${n.closing}</td></tr>
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;">– ${n.signoff}</td></tr>
<tr><td style="height:32px;font-size:0;">&nbsp;</td></tr>
<!-- FOOTER -->
<tr><td style="background-color:#0f171f;padding:24px;">
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
<td style="color:#ffffff;font-size:13px;line-height:1.8;">
<a href="{{UNSUBSCRIBE_URL}}" style="color:#c2dcff;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp;
<a href="https://www.skillstudio.ai/policies/privacy" style="color:#c2dcff;text-decoration:underline;">Privacy Notice</a><br>
<span style="color:#888;">${footerText}</span>
</td>
</tr></tbody></table>
</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body></html>`;
  };

  const handleCopyHtml = async () => {
    if (!newsletter) return;
    await navigator.clipboard.writeText(buildHtml(newsletter));
    setCopied(true);
    toast({ title: "HTML copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!newsletter) return;
    const blob = new Blob([buildHtml(newsletter)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-${article.title.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setNewsletter(null); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0 sticky top-0 z-10 bg-background">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Newsletter Editor
          </DialogTitle>
          {newsletter && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Subject:</span> {newsletter.subject_line}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Preview:</span> {newsletter.preview_text}
              </p>
            </div>
          )}
        </DialogHeader>

        {/* Tab Bar */}
        {newsletter && (
          <div className="flex gap-1 px-6 pt-3 flex-shrink-0 sticky top-[89px] z-10 bg-background border-b border-border pb-3">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("edit")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => setActiveTab("html")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "html" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              HTML
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Converting blog to newsletter...</p>
            </div>
          )}

          {!loading && newsletter && activeTab === "edit" && (
            <div className="space-y-5 max-w-2xl mx-auto">
              {/* First Name variable helper */}
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Insert variable:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText("{{first_name}}");
                    toast({ title: "Copied {{first_name}} to clipboard" });
                  }}
                  className="inline-flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono px-2.5 py-1 rounded-md transition-colors"
                >
                  <Plus className="h-3 w-3" /> {"{{first_name}}"}
                </button>
                <span className="text-xs text-muted-foreground">— click to copy, then paste anywhere in the fields below</span>
              </div>

              {/* Subject & Preview */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject & Preview</h3>
                <div>
                  <label className="text-xs font-medium mb-1 block">Subject Line</label>
                  <input
                    value={newsletter.subject_line}
                    onChange={e => setNewsletter({ ...newsletter, subject_line: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Preview Text</label>
                  <input
                    value={newsletter.preview_text}
                    onChange={e => setNewsletter({ ...newsletter, preview_text: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Opening */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opening</h3>
                <div>
                  <label className="text-xs font-medium mb-1 block">Greeting</label>
                  <input
                    value={newsletter.greeting}
                    onChange={e => setNewsletter({ ...newsletter, greeting: e.target.value })}
                    placeholder='e.g. Hi {{first_name}},'
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Opening Hook</label>
                  <textarea
                    value={newsletter.opening_hook}
                    onChange={e => setNewsletter({ ...newsletter, opening_hook: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</h3>
                {newsletter.sections.map((section, i) => (
                  <div key={i} className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Section {i + 1}</span>
                      <button
                        onClick={() => setNewsletter({ ...newsletter, sections: newsletter.sections.filter((_, j) => j !== i) })}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      value={section.heading}
                      onChange={e => {
                        const sections = [...newsletter.sections];
                        sections[i] = { ...sections[i], heading: e.target.value };
                        setNewsletter({ ...newsletter, sections });
                      }}
                      placeholder="Section heading"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <textarea
                      value={section.body}
                      onChange={e => {
                        const sections = [...newsletter.sections];
                        sections[i] = { ...sections[i], body: e.target.value };
                        setNewsletter({ ...newsletter, sections });
                      }}
                      rows={3}
                      placeholder="Section body"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                    {section.bullets && section.bullets.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Bullets</label>
                        {section.bullets.map((bullet, j) => (
                          <div key={j} className="flex gap-2">
                            <input
                              value={bullet}
                              onChange={e => {
                                const sections = [...newsletter.sections];
                                const bullets = [...(sections[i].bullets || [])];
                                bullets[j] = e.target.value;
                                sections[i] = { ...sections[i], bullets };
                                setNewsletter({ ...newsletter, sections });
                              }}
                              className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button
                              onClick={() => {
                                const sections = [...newsletter.sections];
                                sections[i] = { ...sections[i], bullets: section.bullets!.filter((_, k) => k !== j) };
                                setNewsletter({ ...newsletter, sections });
                              }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* What This Means */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What This Means For You</h3>
                <textarea
                  value={newsletter.what_this_means}
                  onChange={e => setNewsletter({ ...newsletter, what_this_means: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              {/* CTA */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Call to Action Button</h3>
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Auto-link:</span>{" "}
                  {articleUrl
                    ? <>"Read the full article →" links to <span className="font-mono text-primary">{articleUrl}</span></>
                    : <span className="text-orange-500">⚠ Set your Website URL in <a href="/settings" className="underline">Newsletter Settings</a> to auto-generate the article link</span>
                  }
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Button Text</label>
                  <input
                    value={newsletter.cta_text}
                    onChange={e => setNewsletter({ ...newsletter, cta_text: e.target.value })}
                    placeholder="e.g. Sign up today, Learn more, Start free trial"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Button URL</label>
                  <input
                    value={newsletter.cta_url || ""}
                    onChange={e => setNewsletter({ ...newsletter, cta_url: e.target.value })}
                    placeholder="https://training.skillstudio.ai"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">This URL is tracked for click analytics</p>
                </div>
              </div>

              {/* Closing */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closing</h3>
                <div>
                  <label className="text-xs font-medium mb-1 block">Closing Line</label>
                  <textarea
                    value={newsletter.closing}
                    onChange={e => setNewsletter({ ...newsletter, closing: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Sign-off</label>
                  <input
                    value={newsletter.signoff}
                    onChange={e => setNewsletter({ ...newsletter, signoff: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Save edits */}
              <Button
                onClick={() => {
                  if (article.id) {
                    supabase.from("articles").update({ newsletter_data: newsletter } as any).eq("id", article.id).then(() => {
                      toast({ title: "Newsletter saved ✓" });
                    });
                  }
                  setActiveTab("preview");
                }}
                className="w-full"
              >
                Save & Preview
              </Button>
            </div>
          )}

          {!loading && newsletter && activeTab === "preview" && (
            <div className="bg-[#f0f1f5] p-4 rounded-lg">
              <div className="max-w-[600px] mx-auto bg-white rounded-lg overflow-hidden shadow-sm">
                {/* Logo */}
                {brandSettings.logoUrl && (
                  <div className="p-6 pb-0 text-center">
                    <img src={brandSettings.logoUrl} alt={brandSettings.fromName} className="h-10 w-auto mx-auto" />
                  </div>
                )}
                {/* Cover image */}
                {article.cover_image_url && (
                  <div className="mt-4">
                    <img src={article.cover_image_url} alt={article.title} className="w-full h-48 object-cover" />
                  </div>
                )}
                <div className="p-6">
                  {/* Title */}
                  <h1 className="text-2xl font-bold text-[#0f171f] mb-4">{article.title}</h1>
                  {/* Greeting */}
                  <p className="text-[#0f171f] mb-4">{newsletter.greeting.replace(/\{\{first_name\}\}/gi, "First Name")}</p>
                  {/* Hook */}
                  <p className="text-[#0f171f] leading-relaxed mb-6">{newsletter.opening_hook}</p>
                  {/* Sections */}
                  {newsletter.sections.map((s, i) => (
                    <div key={i} className="mb-6">
                      <h2 className="text-lg font-semibold text-[#0f171f] mb-2">{s.heading}</h2>
                      <p className="text-[#0f171f] leading-relaxed mb-3">{s.body}</p>
                      {s.bullets && s.bullets.length > 0 && (
                        <ul className="space-y-1">
                          {s.bullets.map((b, j) => (
                            <li key={j} className="flex gap-2 text-[#0f171f]">
                              <span className="mt-0.5">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {/* What this means */}
                  <div className="bg-[#f0f4ff] border-l-4 border-[#4a53fa] p-4 mb-6 rounded-r">
                    <p className="text-xs font-bold text-[#4a53fa] uppercase tracking-wider mb-1">What This Means For You</p>
                    <p className="text-sm text-[#0f171f] leading-relaxed">{newsletter.what_this_means}</p>
                  </div>
                  {/* Read full article link */}
                  {(articleUrl || newsletter.cta_url) && (
                    <div className="text-center mb-3">
                      <a href={articleUrl || newsletter.cta_url} className="text-[#0c61e9] text-sm font-semibold underline">
                        Read the full article →
                      </a>
                    </div>
                  )}
                  {/* CTA Button */}
                  <div className="text-center mb-6">
                    <a href={newsletter.cta_url || ctaUrl || "#"} className="inline-block bg-[#0c61e9] text-white font-bold px-8 py-3 rounded-full text-base no-underline">
                      {newsletter.cta_text || "Read the full article"}
                    </a>
                    {newsletter.cta_url && <p className="text-xs text-muted-foreground mt-1">{newsletter.cta_url}</p>}
                  </div>
                  {/* Closing */}
                  <p className="text-[#0f171f] leading-relaxed mb-2">{newsletter.closing}</p>
                  <p className="text-[#0f171f]">– {newsletter.signoff}</p>
                </div>
                {/* Footer */}
                <div className="bg-[#0f171f] px-6 py-5">
                  <p className="text-xs text-[#888]">
                    <a href="#" className="text-[#c2dcff] underline">Unsubscribe</a>
                    {" "}|{" "}
                    <a href="#" className="text-[#c2dcff] underline">Privacy Notice</a>
                    <br />
                    © {brandSettings.fromName}. All Rights Reserved.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loading && newsletter && activeTab === "html" && (
            <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
              {buildHtml(newsletter)}
            </pre>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => { setNewsletter(null); if (article.id) supabase.from("articles").update({ newsletter_data: null } as any).eq("id", article.id).then(() => {}); generate(); }} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Regenerate
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button variant="outline" size="sm" onClick={handleCopyHtml} disabled={!newsletter}>
              {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
              Copy HTML
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={!newsletter}>
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </Button>
            <Button size="sm" onClick={() => setShowScheduler(true)} disabled={!newsletter}>
              <Send className="h-4 w-4 mr-1.5" />
              Schedule & Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {newsletter && (
      <NewsletterScheduler
        open={showScheduler}
        onClose={() => setShowScheduler(false)}
        newsletterHtml={buildHtml(newsletter)}
        subjectLine={newsletter.subject_line}
        previewText={newsletter.preview_text}
        articleId={article.id}
      />
    )}
    </>
  );
}
