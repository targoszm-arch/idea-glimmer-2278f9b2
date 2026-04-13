# Content Lab MCP — Quickstart

Connect Content Lab to Claude (cowork or Desktop) so Claude can draft
articles and schedule LinkedIn posts on your behalf.

The MCP server is a Supabase edge function at:

```
https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp
```

It speaks the Model Context Protocol over Streamable HTTP (a single POST
endpoint, JSON-RPC 2.0 framing).

## 1. Generate a Content Lab API key

1. Open Content Lab → **Settings** → **API Keys**
2. Click **Generate Key**
3. Copy the key — it starts with `cl_`. You won't see it again.

## 2. Add Content Lab to Claude

### Claude cowork (web)

**Settings → Connectors → Add custom connector**

| Field | Value |
|---|---|
| Name | `Content Lab` |
| URL | `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp` |
| Auth type | Bearer token |
| Token | `cl_…` (paste the key from step 1) |

### Claude Desktop

Requires Node.js (https://nodejs.org). `npx` downloads `mcp-remote`
automatically on first run.

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "contentlab": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp",
        "--header",
        "Authorization: Bearer cl_your_key_here"
      ]
    }
  }
}
```

Restart Claude Desktop. The Content Lab tools should appear in the
hammer/tools panel.

## 3. Available tools

| Tool | What it does |
|---|---|
| `create_article` | Generate a new SEO article from a topic. Costs 5 credits. |
| `list_articles` | Browse your article library. |
| `list_social_posts` | See drafts, scheduled, posted, and failed social posts. |
| `schedule_social_post` | Queue a LinkedIn post for auto-publishing. |

## 4. Try it

Ask Claude:

> "Use Content Lab to draft an article about [topic], then schedule a
> LinkedIn post about it for tomorrow at 9am UK time."

Claude will call `create_article`, then `schedule_social_post`. The cron
worker (`process-scheduled-posts`) runs every minute and will publish the
LinkedIn post at the scheduled time.

## 5. Troubleshooting

- **`401 Unauthorized`** — your key is missing or invalid. Regenerate it in
  Settings → API Keys and update the connector.
- **`Insufficient credits`** — top up in Settings → Billing.
- **Tools not appearing in Claude cowork** — disconnect and reconnect the
  connector; Claude refreshes the tool list on connect.
- **Scheduled LinkedIn post stuck on `failed`** — open Content Lab, check the
  post's `error_message`. Most common cause is an expired LinkedIn token —
  reconnect in Settings → Integrations.

## 6. Limitations (v1)

- LinkedIn is the only auto-publish platform. Twitter / Facebook / Instagram
  scheduling is roadmapped.
- Newsletter generation and improve-article tools are not yet exposed (the
  underlying functions need API-key-auth support added first).
- OAuth-based connector flow (so you don't paste a key) is the next step
  before submitting Content Lab to Anthropic's connector directory.
