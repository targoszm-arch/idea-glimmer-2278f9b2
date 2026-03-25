import { useState, useEffect } from "react";
import { Copy, Check, RefreshCw, Key } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const APIKey = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchKey();
  }, []);

  async function fetchKey() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    // GET — only reads the existing key, never generates a new one
    const { data } = await supabase.functions.invoke("generate-api-key", {
      method: "GET",
    } as any);
    setApiKey(data?.key ?? null);
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    // POST — explicitly generates / regenerates a key
    const { data, error } = await supabase.functions.invoke("generate-api-key", {
      method: "POST",
    } as any);
    if (error) {
      toast({ title: "Error", description: "Failed to generate key", variant: "destructive" });
    } else {
      setApiKey(data?.key ?? null);
      toast({ title: "New API key generated" });
    }
    setGenerating(false);
  }

  function handleCopy() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Key className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">API Key</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">ContentLab API Key</h2>
            <p className="text-sm text-gray-500">
              Use this key in the ContentLab Framer plugin or Canva app to connect your account.
            </p>
          </div>

          {loading ? (
            <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ) : apiKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono text-gray-800 truncate">
                {apiKey}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
              No API key yet. Generate one below.
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Keep this key secret. Regenerating will invalidate the old key.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
              {apiKey ? "Regenerate" : "Generate Key"}
            </button>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-5">
          <h3 className="font-semibold text-blue-900 mb-2">How to use</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Copy your API key above</li>
            <li>In the Framer plugin — paste it into the API Key field and click Next</li>
            <li>In the Canva app — paste it into the Connect ContentLab screen</li>
            <li>Click Sync to import your articles</li>
          </ol>
        </div>
      </div>
    </PageLayout>
  );
};

export default APIKey;
