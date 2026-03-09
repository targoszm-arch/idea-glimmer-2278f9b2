/**
 * This page shows instructions for connecting the Framer plugin.
 * The actual plugin is served as a static file at /framer-plugin/index.html
 */
const FramerPlugin = () => {
  const pluginUrl = `${window.location.origin}/framer-plugin/index.html`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Framer Plugin Setup</h1>
        <p className="text-muted-foreground text-sm">
          To connect your Skill Studio articles to Framer CMS:
        </p>
        <ol className="text-left text-sm text-muted-foreground space-y-3 list-decimal list-inside">
          <li>Open your Framer project</li>
          <li>Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘K</kbd> → <strong>Open Development Plugin</strong></li>
          <li>
            Paste this URL:
            <code className="block mt-1 p-2 bg-muted rounded text-xs font-mono break-all select-all">
              {pluginUrl}
            </code>
          </li>
          <li>Click <strong>Open</strong>, then use the Sync button inside Framer</li>
        </ol>
        <p className="text-xs text-muted-foreground/60">
          The plugin runs inside Framer's iframe — it won't work standalone in a browser.
        </p>
      </div>
    </div>
  );
};

export default FramerPlugin;
