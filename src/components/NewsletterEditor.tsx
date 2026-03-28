import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Download, Mail, RefreshCw, Check, Send } from "lucide-react";
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
  };
  brandName?: string;
  brandLogoUrl?: string;
  ctaUrl?: string;
}

export function NewsletterEditor({ open, onClose, article, brandName = "ContentLab", brandLogoUrl, ctaUrl }: Props) {
  const [newsletter, setNewsletter] = useState<NewsletterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "html">("preview");
  const [showScheduler, setShowScheduler] = useState(false);
  const [brandSettings, setBrandSettings] = useState({
    fromName: brandName || "ContentLab",
    fromEmail: "",
    replyTo: "",
    footerText: "",
    logoUrl: brandLogoUrl || "",
    websiteUrl: ctaUrl || "",
  });

  // Load brand settings + saved newsletter (or generate fresh) on open
  React.useEffect(() => {
    if (!open) return;

    // Load brand settings
    supabase.from("ai_settings" as any).select("newsletter_from_name,newsletter_from_email,newsletter_reply_to,newsletter_footer_text,newsletter_brand_logo_url,newsletter_website_url").limit(1).maybeSingle().then(({ data }: any) => {
      if (data) setBrandSettings({
        fromName: data.newsletter_from_name || brandName || "ContentLab",
        fromEmail: data.newsletter_from_email || "",
        replyTo: data.newsletter_reply_to || "",
        footerText: data.newsletter_footer_text || "",
        logoUrl: data.newsletter_brand_logo_url || brandLogoUrl || "",
        websiteUrl: data.newsletter_website_url || ctaUrl || "",
      });
    });

    // Try to load saved newsletter from DB first
    if (article.id && !newsletter) {
      supabase.from("articles").select("newsletter_data").eq("id", article.id).maybeSingle().then(({ data }: any) => {
        if (data?.newsletter_data) {
          setNewsletter(data.newsletter_data as NewsletterData);
        } else {
          generate();
        }
      });
    } else if (!newsletter) {
      generate();
    }
  }, [open]);

  // Build article CTA URL using the website URL + slug pattern
  // e.g. https://www.skillstudio.ai/latest-articles/{slug}
  const articleUrl = (() => {
    const websiteBase = brandSettings.websiteUrl || ctaUrl || "";
    if (!websiteBase) return "";
    // If we have a slug, append it under /latest-articles/ (Framer's default)
    if (article.slug) {
      const base = websiteBase.replace(/\/$/, "");
      return `${base}/latest-articles/${article.slug}`;
    }
    return websiteBase;
  })();

  const generate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
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
        setNewsletter(data.newsletter);
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
    const footerName = brandSettings.fromName || brandName || "ContentLab";
    const footerText = brandSettings.footerText || `© ${footerName}. All Rights Reserved.`;
    const cta = articleUrl;
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
<!-- CTA -->
${cta ? `<tr><td style="padding:0 24px;text-align:center;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tbody><tr><td style="background-color:#0c61e9;border-radius:100px;padding:14px 32px;">
<a href="${cta}" target="_blank" style="color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${n.cta_text}</a>
</td></tr></tbody></table>
</td></tr>
<tr><td style="height:24px;font-size:0;">&nbsp;</td></tr>` : ""}
<!-- CLOSING -->
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;line-height:1.6;">${n.closing}</td></tr>
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:0 24px;color:#0f171f;font-size:16px;">– ${n.signoff}</td></tr>
<tr><td style="height:32px;font-size:0;">&nbsp;</td></tr>
<!-- FOOTER — {{{ unsubscribe_url }}} is auto-replaced by Resend -->
<tr><td style="background-color:#0f171f;padding:24px;">
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
<td style="color:#ffffff;font-size:13px;line-height:1.8;">
<a href="{{{ unsubscribe_url }}}" style="color:#c2dcff;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp;
<a href="{{{ unsubscribe_url }}}" style="color:#c2dcff;text-decoration:underline;">Privacy Notice</a><br>
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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

          {!loading && newsletter && activeTab === "preview" && (
            <div className="bg-[#f0f1f5] p-4 rounded-lg">
              <div className="max-w-[600px] mx-auto bg-white rounded-lg overflow-hidden shadow-sm">
                {/* Logo */}
                {brandLogoUrl && (
                  <div className="p-6 pb-0 text-center">
                    <img src={brandLogoUrl} alt={brandName} className="h-10 w-auto mx-auto" />
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
                  <p className="text-[#0f171f] mb-4">{newsletter.greeting}</p>
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
                  {/* CTA */}
                  {ctaUrl && (
                    <div className="text-center mb-6">
                      <a
                        href={ctaUrl}
                        className="inline-block bg-[#0c61e9] text-white font-bold px-8 py-3 rounded-full text-base no-underline"
                      >
                        {newsletter.cta_text}
                      </a>
                    </div>
                  )}
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
                    © {brandName}. All Rights Reserved.
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
