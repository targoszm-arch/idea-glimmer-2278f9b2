import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FRAMER_JSON = {
  id: "skill-studio-cms-sync",
  name: "Skill Studio Blog Sync",
  version: "1.0.0",
  description: "Sync published Skill Studio AI articles into a Framer managed collection.",
  modes: ["configureManagedCollection", "syncManagedCollection"],
};

const PLUGIN_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Skill Studio Blog Sync</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        background: #0f0f0f;
        color: #e8e8e8;
        padding: 20px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      h1 { font-size: 15px; font-weight: 600; color: #fff; }
      p { font-size: 13px; color: #999; line-height: 1.5; }
      button {
        width: 100%;
        padding: 10px 16px;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: #0099ff; color: #fff; }
      .btn-primary:hover:not(:disabled) { opacity: 0.85; }
      .btn-secondary { background: #222; color: #ccc; border: 1px solid #333; }
      .btn-secondary:hover:not(:disabled) { background: #2a2a2a; }
      #status {
        font-size: 12px;
        padding: 8px 12px;
        border-radius: 6px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        display: none;
      }
      #status.visible { display: block; }
      #status.error { border-color: #ff4444; color: #ff6666; }
      #status.success { border-color: #00cc66; color: #00ee77; }
      #status.info { border-color: #0099ff; color: #33aaff; }
      .divider { border: none; border-top: 1px solid #222; }
    </style>
  </head>
  <body>
    <h1>Skill Studio Blog Sync</h1>
    <p>Syncs your published articles from Skill Studio AI into this Framer CMS collection.</p>

    <button class="btn-primary" id="btn-sync" onclick="runSync()">⟳ Sync Articles Now</button>
    <hr class="divider" />
    <button class="btn-secondary" id="btn-configure" onclick="runConfigure()">⚙ Configure Collection Fields</button>

    <div id="status"></div>

    <script type="module">
      const SYNC_ENDPOINT = "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/framer-sync-articles";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

      const FIELDS = [
        { name: "Title", type: "string" },
        { name: "Body", type: "formattedText" },
        { name: "Excerpt", type: "string" },
        { name: "Category", type: "string" },
        { name: "Cover Image", type: "image" },
        { name: "Meta Description", type: "string" },
        { name: "Published Date", type: "date" },
        { name: "Video URL", type: "string" },
      ];

      function setStatus(msg, type = "info") {
        const el = document.getElementById("status");
        el.textContent = msg;
        el.className = "visible " + type;
      }

      function setLoading(loading) {
        document.getElementById("btn-sync").disabled = loading;
        document.getElementById("btn-configure").disabled = loading;
      }

      let framer;
      try {
        const mod = await import("https://esm.sh/framer-plugin@0.1.38");
        framer = mod.framer;
      } catch (e) {
        framer = window.framer;
      }

      window.runConfigure = async function () {
        if (!framer) { setStatus("Framer SDK not available.", "error"); return; }
        setLoading(true);
        setStatus("Configuring collection fields…", "info");
        try {
          const collection = await framer.getManagedCollection();
          if (!collection) { setStatus("No managed collection found.", "error"); setLoading(false); return; }
          for (const field of FIELDS) {
            try { await collection.addField({ name: field.name, type: field.type }); } catch {}
          }
          setStatus("Collection fields configured ✓", "success");
          framer.showToast("Collection configured ✓");
        } catch (err) {
          setStatus("Error: " + (err?.message || err), "error");
        }
        setLoading(false);
      };

      window.runSync = async function () {
        if (!framer) { setStatus("Framer SDK not available.", "error"); return; }
        setLoading(true);
        setStatus("Fetching published articles…", "info");
        try {
          const collection = await framer.getManagedCollection();
          if (!collection) { setStatus("No managed collection found.", "error"); setLoading(false); return; }

          const collectionId = collection.id ?? "";

          const res = await fetch(SYNC_ENDPOINT + "?status=published", {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + SUPABASE_ANON_KEY,
              apikey: SUPABASE_ANON_KEY,
              "x-framer-collection-id": collectionId,
            },
          });

          if (res.status === 403) {
            const err = await res.json().catch(() => ({}));
            const msg = (err.error || "Upgrade required to sync more collections.") +
              " Upgrade at: https://buy.stripe.com/8x28wOdlsdBpak09Jk1sQ06";
            setStatus(msg, "error");
            setLoading(false); return;
          }
          if (!res.ok) { setStatus("Fetch failed: " + await res.text(), "error"); setLoading(false); return; }

          const { articles } = await res.json();
          if (!articles?.length) { setStatus("No published articles found.", "info"); setLoading(false); return; }

          setStatus("Syncing " + articles.length + " article(s)…", "info");

          const fields = await collection.getFields();
          const fieldMap = new Map(fields.map(f => [f.name, f.id]));

          const items = articles.map(a => {
            const fd = {};
            const titleId = fieldMap.get("Title");
            const bodyId = fieldMap.get("Body");
            const excId = fieldMap.get("Excerpt");
            const catId = fieldMap.get("Category");
            const covId = fieldMap.get("Cover Image");
            const metId = fieldMap.get("Meta Description");
            const datId = fieldMap.get("Published Date");
            const vidId = fieldMap.get("Video URL");
            if (titleId) fd[titleId] = { type: "string", value: a.title };
            if (bodyId) fd[bodyId] = { type: "formattedText", value: a.content, contentType: "html" };
            if (excId) fd[excId] = { type: "string", value: a.excerpt };
            if (catId) fd[catId] = { type: "string", value: a.category };
            if (metId) fd[metId] = { type: "string", value: a.meta_description };
            if (datId) fd[datId] = { type: "date", value: a.created_at };
            if (covId && a.cover_image_url && !a.cover_image_url.startsWith("data:"))
              fd[covId] = { type: "image", value: a.cover_image_url };
            if (vidId && a.video_url) fd[vidId] = { type: "string", value: a.video_url };
            return { id: a.id, slug: a.slug, title: a.title, fieldData: fd };
          });

          await collection.addItems(items);
          setStatus("Synced " + articles.length + " article(s) ✓", "success");
          framer.showToast("Synced " + articles.length + " article(s) ✓");
        } catch (err) {
          setStatus("Error: " + (err?.message || err), "error");
        }
        setLoading(false);
      };

      const mode = new URLSearchParams(window.location.search).get("mode");
      if (mode === "configureManagedCollection") window.runConfigure();
      else if (mode === "syncManagedCollection") window.runSync();
    <\/script>
  </body>
</html>`;

const FramerPlugin = () => {
  const { toast } = useToast();
  const [downloaded, setDownloaded] = useState(false);

  const downloadPluginZip = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    
    zip.file("framer.json", JSON.stringify(FRAMER_JSON, null, 2));
    zip.file("index.html", PLUGIN_HTML);
    
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skill-studio-framer-plugin.zip";
    a.click();
    URL.revokeObjectURL(url);
    
    setDownloaded(true);
    toast({ title: "Plugin downloaded!", description: "Extract and upload to Framer." });
  };

  const copyInstructions = () => {
    navigator.clipboard.writeText(
      "1. Extract the ZIP\n2. In Framer: ⌘K → Open Development Plugin\n3. Click 'Import from folder' and select the extracted folder"
    );
    toast({ title: "Instructions copied!" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Framer Plugin Setup</h1>
        <p className="text-muted-foreground text-sm">
          Download the plugin files and import them into Framer.
        </p>
        
        <Button onClick={downloadPluginZip} className="w-full" size="lg">
          <Download className="mr-2 h-4 w-4" />
          Download Plugin ZIP
        </Button>

        {downloaded && (
          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle className="h-4 w-4 text-primary" />
              Next steps:
            </div>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Extract the ZIP file</li>
              <li>In Framer, press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘K</kbd> → <strong>Open Development Plugin</strong></li>
              <li>Click <strong>"Import from folder"</strong> and select the extracted folder</li>
              <li>Use the <strong>Sync</strong> button to import your articles</li>
            </ol>
            <Button variant="outline" size="sm" onClick={copyInstructions} className="mt-2">
              <Copy className="mr-2 h-3 w-3" />
              Copy Instructions
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60">
          The plugin syncs your published Skill Studio articles into Framer CMS.
        </p>
      </div>
    </div>
  );
};

export default FramerPlugin;
