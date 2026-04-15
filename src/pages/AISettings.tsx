import { useState, useEffect } from "react";
import { Settings, Save, Loader2, Plus, X, Check, Mail } from "lucide-react";
import { motion } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { TONE_PRESETS } from "@/lib/tones";
import { toast } from "@/hooks/use-toast";

const AISettings = ({ embedded = false }: { embedded?: boolean }) => {
  const { user } = useAuth();
  const [selectedTone, setSelectedTone] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [appAudience, setAppAudience] = useState("");
  const [socialVoiceProfile, setSocialVoiceProfile] = useState("");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Newsletter brand settings
  const [newsletterFromName, setNewsletterFromName] = useState("");
  const [newsletterFromEmail, setNewsletterFromEmail] = useState("");
  const [newsletterReplyTo, setNewsletterReplyTo] = useState("");
  const [newsletterFooterText, setNewsletterFooterText] = useState("");
  const [newsletterBrandLogoUrl, setNewsletterBrandLogoUrl] = useState("");
  const [newsletterWebsiteUrl, setNewsletterWebsiteUrl] = useState("");
  const [brandLogos, setBrandLogos] = useState<{ id: string; name: string; file_url: string }[]>([]);

  useEffect(() => {
    // Load logos from brand_assets
    supabase.from("brand_assets" as any).select("id, name, file_url").eq("type", "logo").order("created_at", { ascending: true }).then(({ data }: any) => {
      if (data) setBrandLogos(data);
    });

    (async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setSettingsId(data.id);
        setSelectedTone(data.tone_key || "");
        setAppDescription(data.app_description || "");
        setAppAudience(data.app_audience || "");
        setSocialVoiceProfile((data as any).social_voice_profile || "");
        setReferenceUrls(data.reference_urls || []);
        setNewsletterFromName((data as any).newsletter_from_name || "ContentLab");
        setNewsletterFromEmail((data as any).newsletter_from_email || "");
        setNewsletterReplyTo((data as any).newsletter_reply_to || "");
        setNewsletterFooterText((data as any).newsletter_footer_text || "");
        setNewsletterBrandLogoUrl((data as any).newsletter_brand_logo_url || "");
        setNewsletterWebsiteUrl((data as any).newsletter_website_url || "");
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const tone = TONE_PRESETS.find((t) => t.key === selectedTone) || TONE_PRESETS[0];

    const payload = {
      user_id: user?.id,
      tone_key: tone.key,
      tone_label: tone.label,
      tone_description: tone.description,
      app_description: appDescription,
      app_audience: appAudience,
      social_voice_profile: socialVoiceProfile,
      reference_urls: referenceUrls,
      newsletter_from_name: newsletterFromName,
      newsletter_from_email: newsletterFromEmail,
      newsletter_reply_to: newsletterReplyTo,
      newsletter_footer_text: newsletterFooterText,
      newsletter_brand_logo_url: newsletterBrandLogoUrl,
      newsletter_website_url: newsletterWebsiteUrl,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (settingsId) {
      ({ error } = await supabase.from("ai_settings").update(payload).eq("id", settingsId));
    } else {
      const res = await supabase.from("ai_settings").insert(payload).select().single();
      error = res.error;
      if (res.data) setSettingsId(res.data.id);
    }

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved!" });
    }
    setSaving(false);
  };

  const addUrl = () => {
    const input = newUrl.trim();
    if (!input) return;
    const urls = input
      .split(/[\s,\n]+/)
      .map((u) => u.trim())
      .filter((u) => u && !referenceUrls.includes(u));
    if (urls.length > 0) {
      setReferenceUrls([...referenceUrls, ...urls]);
      setNewUrl("");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const inner = (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <Settings className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">AI Settings</h1>
              <p className="mt-1 text-muted-foreground">
                Configure your knowledge base for AI-generated articles
              </p>
            </div>
          </div>

          {/* Tone & Voice */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground">Your Content's Tone and Voice</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Select the default tone and voice for your articles
            </p>
            {!selectedTone && <p className="mb-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">No tone selected — please choose one below</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              {TONE_PRESETS.map((tone) => {
                const isSelected = selectedTone === tone.key;
                return (
                  <button
                    key={tone.key}
                    onClick={() => setSelectedTone(tone.key)}
                    className={`group relative rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/30 hover:bg-secondary/50"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <h3 className={`mb-1 text-sm font-bold uppercase tracking-wide ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {tone.label}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-3">{tone.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* App Description */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground">Platform Description</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Provide a description of your app that will be used by AI to better understand your content
            </p>
            <textarea
              value={appDescription}
              onChange={(e) => setAppDescription(e.target.value.slice(0, 800))}
              placeholder="Describe your product or platform so AI understands what you do..."
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{appDescription.length}/800 characters</p>
          </section>

          {/* App Audience */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground">Your Target Audience</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Describe your target audience to help AI generate more relevant content
            </p>
            <textarea
              value={appAudience}
              onChange={(e) => setAppAudience(e.target.value.slice(0, 800))}
              placeholder="Describe who your content is for..."
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{appAudience.length}/800 characters</p>
          </section>

          {/* Social Voice Profile */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground">Your Social Voice</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              The strongest way to make AI-generated social posts sound like you: paste 3-5 of your
              best-performing posts, or describe your voice in your own words. This is injected directly
              into the LinkedIn / Twitter / Instagram generation prompt.
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              Tip: look for your own cadence (short sentences? fragments?), vocabulary (plain vs.
              technical), perspective (first person? do you admit uncertainty?), and what you believe
              about your craft. Leave blank to use a neutral default.
            </p>
            <textarea
              value={socialVoiceProfile}
              onChange={(e) => setSocialVoiceProfile(e.target.value.slice(0, 6000))}
              placeholder={`Paste 3-5 of your best posts here, separated by two blank lines. Or describe your voice directly — e.g.

Cadence: short paragraphs, one sentence each. Fragments are fine.
Vocabulary: plain, direct. No jargon.
Perspective: first person, admits being wrong, asks questions I don't have answers to.
Beliefs: care about craft, skeptical of hype, small things tell the truth.`}
              rows={10}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{socialVoiceProfile.length}/6000 characters</p>
          </section>

          {/* Reference URLs */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground">Reference URLs</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Links to website content that the AI should analyse and create similar content based on
            </p>

            <div className="flex gap-2">
              <textarea
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder="Paste one or multiple URLs (separated by commas, spaces, or new lines)"
                rows={2}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <button
                onClick={addUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 self-end"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{referenceUrls.length} URLs added</p>

            {referenceUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {referenceUrls.map((url, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground"
                  >
                    <span className="max-w-[200px] truncate">{url}</span>
                    <button
                      onClick={() => setReferenceUrls(referenceUrls.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Newsletter Brand Settings */}
          <section className="mb-8 rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Newsletter Settings
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              These settings are applied automatically to all newsletters you generate and send
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">From Name *</label>
                <input value={newsletterFromName} onChange={e => setNewsletterFromName(e.target.value)}
                  placeholder="e.g. Skill Studio AI"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">From Email *</label>
                <input value={newsletterFromEmail} onChange={e => setNewsletterFromEmail(e.target.value)}
                  placeholder="newsletter@yourdomain.com"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <p className="text-xs text-muted-foreground mt-1">Must be a verified Resend domain</p>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Reply-To Email</label>
                <input value={newsletterReplyTo} onChange={e => setNewsletterReplyTo(e.target.value)}
                  placeholder="Same as from email"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Website URL</label>
                <input value={newsletterWebsiteUrl} onChange={e => setNewsletterWebsiteUrl(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <p className="text-xs text-muted-foreground mt-1">Used for "Read full article" links</p>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-foreground mb-1 block">Brand Logo</label>
                {brandLogos.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {brandLogos.map(logo => (
                      <button
                        key={logo.id}
                        type="button"
                        onClick={() => setNewsletterBrandLogoUrl(logo.file_url)}
                        className={`relative rounded-lg border-2 p-2 transition-all bg-white ${newsletterBrandLogoUrl === logo.file_url ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                      >
                        <img src={logo.file_url} alt={logo.name} className="h-12 w-auto max-w-[120px] object-contain" />
                        {newsletterBrandLogoUrl === logo.file_url && (
                          <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</span>
                        )}
                      </button>
                    ))}
                    {newsletterBrandLogoUrl && (
                      <button type="button" onClick={() => setNewsletterBrandLogoUrl("")} className="text-xs text-muted-foreground hover:text-destructive self-center">Clear</button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No logos found. Upload logos in <a href="/settings/brand" className="text-primary underline">Settings → Brand → Logos</a>.</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-foreground mb-1 block">Footer Text</label>
                <textarea value={newsletterFooterText} onChange={e => setNewsletterFooterText(e.target.value)}
                  placeholder="© 2026 Your Company. All rights reserved."
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
              </div>
            </div>
          </section>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
    </motion.div>
  );
  return embedded ? inner : <PageLayout>{inner}</PageLayout>;
};

export default AISettings;
