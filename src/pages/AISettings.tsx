import { useState, useEffect } from "react";
import { Settings, Save, Loader2, Plus, X, Check } from "lucide-react";
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
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
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
        setReferenceUrls(data.reference_urls || []);
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
      reference_urls: referenceUrls,
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
