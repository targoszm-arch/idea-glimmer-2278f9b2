import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadPluginZip } from "@/lib/framer-plugin-download";

const FramerPlugin = () => {
  const { toast } = useToast();
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async () => {
    await downloadPluginZip();
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

        <Button onClick={handleDownload} className="w-full" size="lg">
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
