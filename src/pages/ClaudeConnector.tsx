// Consumer-facing "how to connect Claude" page. Public at /connect/claude.
//
// Two installation paths:
//   1. Claude cowork / claude.ai directory — OAuth 2.1 flow (preferred).
//      The Anthropic directory submission references this page for the
//      "service_documentation" field.
//   2. Claude Desktop via mcp-remote — cl_ API key paste (fallback for
//      users who prefer not to use OAuth).

import { useState } from "react";
import { Copy, Check, ExternalLink, Sparkles, Shield, Zap } from "lucide-react";

const MCP_URL = "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp";

const DESKTOP_CONFIG_EXAMPLE = `{
  "mcpServers": {
    "contentlab": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${MCP_URL}",
        "--header",
        "Authorization: Bearer cl_your_key_here"
      ]
    }
  }
}`;

export default function ClaudeConnector() {
  return (
    <div className="container max-w-3xl py-12 text-foreground">
      <div className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> MCP Connector
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Content Lab to Claude</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Draft articles, schedule LinkedIn posts, and queue newsletters — all by
          chatting with Claude. The Content Lab MCP server exposes nine tools that Claude
          can call on your behalf.
        </p>
      </div>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        <Feature icon={<Shield className="h-4 w-4" />} title="OAuth 2.1" body="PKCE + refresh-token rotation. Your password never leaves content-lab.ie." />
        <Feature icon={<Zap className="h-4 w-4" />} title="Nine tools" body="Create and edit articles, list and schedule posts, manage newsletter sends." />
        <Feature icon={<Sparkles className="h-4 w-4" />} title="You stay in control" body="120 MCP calls/hour by default. Every call logged. Revoke anytime." />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">Option 1 — Claude cowork (recommended)</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          For users on claude.ai — including the Pro, Max, Team, and Enterprise plans.
          Uses OAuth, so you never paste an API key. Revocation is a single click.
        </p>
        <ol className="ml-5 list-decimal space-y-3 text-sm text-foreground [&>li]:leading-relaxed">
          <li>
            Open <a className="underline text-primary" href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">
              claude.ai → Settings → Connectors <ExternalLink className="inline h-3 w-3" />
            </a>.
          </li>
          <li>
            Click <strong>Add custom connector</strong>.
          </li>
          <li>
            Name it <strong>Content Lab</strong>. For the URL, paste:
            <CopyableBlock value={MCP_URL} />
          </li>
          <li>Click Continue. Claude will bounce you through Content Lab's OAuth consent screen.</li>
          <li>Sign in to Content Lab (or sign up if you haven't already) and click Allow.</li>
          <li>You're back in Claude, connected. Try: "Draft an article about onboarding and list my recent drafts."</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">Option 2 — Claude Desktop</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          For the Claude Desktop app (macOS / Windows). Uses an API key instead of OAuth
          because Claude Desktop MCP servers are stdio-based; we bridge HTTP via
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">mcp-remote</code>.
        </p>
        <ol className="ml-5 list-decimal space-y-3 text-sm text-foreground [&>li]:leading-relaxed">
          <li>
            Generate an API key in Content Lab:{" "}
            <a className="underline text-primary" href="/settings/api-key">Settings → API Keys → Create key</a>.
            Copy the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">cl_…</code> string.
          </li>
          <li>
            Open <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</code>
            {" "}(macOS) or <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).
          </li>
          <li>
            Add a new entry under <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">mcpServers</code>:
            <CopyableBlock value={DESKTOP_CONFIG_EXAMPLE} multiline />
          </li>
          <li>Replace <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">cl_your_key_here</code> with your actual key.</li>
          <li>Restart Claude Desktop. The Content Lab tools appear in the tool picker.</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">What Claude can do</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-semibold">Tool</th>
                <th className="p-3 text-left font-semibold">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row name="create_article" desc="Generate a 1,500–2,000 word article. Cover image is opt-in." />
              <Row name="list_articles" desc="List your drafts and published articles." />
              <Row name="get_article" desc="Read a specific article's full body + metadata." />
              <Row name="update_article" desc="Edit an article's title, content, status, etc." />
              <Row name="list_social_posts" desc="See your scheduled, posted, and draft social posts." />
              <Row name="schedule_social_post" desc="Queue a LinkedIn post for auto-publishing." />
              <Row name="list_newsletter_schedules" desc="See your scheduled newsletter sends." />
              <Row name="schedule_newsletter" desc="Schedule a one-time newsletter to your audience." />
              <Row name="cancel_newsletter_schedule" desc="Cancel a scheduled newsletter send." />
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 text-base font-semibold text-foreground">Need help?</h2>
        <p>
          Email <a className="underline text-primary" href="mailto:support@content-lab.ie">support@content-lab.ie</a> or
          see our <a className="underline text-primary" href="/support">support page</a>. Full data handling is
          covered in our <a className="underline text-primary" href="/privacy">privacy policy</a>.
        </p>
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 inline-flex rounded-md bg-primary/10 p-1.5 text-primary">{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Row({ name, desc }: { name: string; desc: string }) {
  return (
    <tr>
      <td className="p-3 font-mono text-xs text-foreground">{name}</td>
      <td className="p-3 text-muted-foreground">{desc}</td>
    </tr>
  );
}

function CopyableBlock({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre
        className={`flex-1 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground ${
          multiline ? "whitespace-pre" : "whitespace-nowrap"
        }`}
      >
        {value}
      </pre>
      <button
        onClick={handleCopy}
        className="mt-0.5 inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
