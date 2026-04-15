# Content Lab MCP — Quickstart

Connect Content Lab to Claude so Claude can draft articles, schedule LinkedIn
posts, and queue newsletter sends on your behalf.

The MCP server is a Supabase edge function at:

```
https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp
```

It speaks the Model Context Protocol over Streamable HTTP (a single POST
endpoint, JSON-RPC 2.0 framing). Protocol version: `2025-06-18`.

There are two installation paths. Pick one:

- **Claude cowork (claude.ai)** — OAuth 2.1 flow. Recommended.
- **Claude Desktop** — `cl_…` API key via the `mcp-remote` bridge.

## Option 1 — Claude cowork (OAuth)

1. Open [claude.ai → Settings → Connectors](https://claude.ai/settings/connectors).
2. Click **Add custom connector**.
3. Name it `Content Lab`. URL:

   ```
   https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp
   ```

4. Click **Continue**. Claude redirects you through Content Lab's OAuth
   consent screen.
5. Sign in to Content Lab (or sign up) and click **Allow**.
6. You're back in Claude, connected. Access can be revoked at any time from
   Settings → API Keys.

## Option 2 — Claude Desktop (API key)

Requires Node.js (https://nodejs.org). `npx` downloads `mcp-remote`
automatically on first run.

1. Generate a Content Lab API key:
   - Settings → API Keys → **Generate Key**
   - Copy the `cl_…` string (you won't see it again).
2. Edit `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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
3. Replace `cl_your_key_here` with your actual key.
4. Restart Claude Desktop. Content Lab tools appear in the hammer/tools panel.

## Available tools (v1 — 9 total)

| Tool | What it does |
|---|---|
| `create_article` | Generate a 1,500–2,000 word SEO article (5 credits). Cover image is opt-in via `generate_cover_image: true` (+5 credits). |
| `list_articles` | Browse your article library (newest first). |
| `get_article` | Fetch a single article with full HTML body + metadata. |
| `update_article` | Edit title, content, excerpt, meta_description, category, status, or cover image URL. |
| `list_social_posts` | See draft, scheduled, posted, and failed social posts. |
| `schedule_social_post` | Queue a LinkedIn post for auto-publishing. 5 pending posts max per user. |
| `list_newsletter_schedules` | List your one-time newsletter sends. |
| `schedule_newsletter` | Schedule a one-time newsletter send (LinkedIn only for social, Resend for email). 5 pending max. |
| `cancel_newsletter_schedule` | Cancel a still-scheduled newsletter send. |

Each tool ships with MCP tool annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`) so Claude can reason about which calls are
safe to auto-invoke.

## Try it

Ask Claude:

> "Use Content Lab to draft an article about onboarding best practices, then
> schedule a LinkedIn post about it for tomorrow at 9 AM UK time."

Claude will call `create_article`, then `schedule_social_post`. The cron worker
(`process-scheduled-posts`) runs every minute and publishes the post on time.

## Rate limits

- **120 MCP tool calls per user per hour** by default.
- Hitting the ceiling returns JSON-RPC error `-32000` with a
  `retry_after_seconds` hint in the message.
- Every invocation (tool name, duration, status) is logged to
  `mcp_tool_invocations` for 90 days.

Need a higher limit? Email support@content-lab.ie.

## Troubleshooting

- **`401 Unauthorized`** — API key revoked or OAuth token expired. For
  Desktop, regenerate a key in Settings → API Keys. For cowork, re-run the
  OAuth flow from claude.ai Settings → Connectors.
- **`Rate limit exceeded` (error -32000)** — you've hit 120 calls/hour. Wait
  for the retry window or email support@content-lab.ie.
- **`Insufficient credits`** — top up in Settings → Billing.
- **Tools not appearing in Claude cowork** — disconnect and reconnect;
  Claude refreshes the tool list on connect.
- **Scheduled LinkedIn post stuck on `failed`** — open Content Lab, check
  the post's `error_message`. Most common cause is an expired LinkedIn token
  — reconnect in Settings → Integrations.

## Security & privacy

- OAuth tokens are HS256-signed JWTs, audience-restricted to the MCP endpoint
  (RFC 8707). 90-min access TTL with refresh-token rotation.
- `cl_…` keys and OAuth refresh tokens are stored in service-role-only tables
  with row-level security.
- Tool invocation audit log redacts any argument key named `password`,
  `token`, `secret`, `api_key`, `authorization`, `bearer`, etc. before storage.
- Full data handling: [Privacy Policy](https://www.app.content-lab.ie/privacy).

## Limitations (v1)

- LinkedIn is the only auto-publish social platform.
  Twitter / Facebook / Instagram scheduling is roadmapped.
- Newsletter sends are one-time, not recurring.
- LinkedIn company-page posting is not yet supported (personal profile only).
