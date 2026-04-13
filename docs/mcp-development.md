# Content Lab MCP — How it was built + what's next

This doc captures how the Content Lab MCP server came together, the
architectural decisions, and what still has to happen before it can be
submitted to Anthropic's public connector directory.

## 1. What is MCP?

**Model Context Protocol** is Anthropic's open protocol for letting LLMs talk
to external tools and data. It's JSON-RPC 2.0 over one of three transports:

| Transport | Used by | Who can connect |
|---|---|---|
| `stdio` (local command) | Claude Desktop | Local processes only |
| `Streamable HTTP` (single POST endpoint, our choice) | Claude cowork, Claude Desktop via `mcp-remote`, any MCP client | Anyone with network access |
| `SSE` (legacy, deprecated) | Old clients | — |

We picked Streamable HTTP because Content Lab is a hosted SaaS — users don't
run a local process, they authenticate to `*.supabase.co`.

## 2. Architecture

```
┌──────────────┐        ┌────────────────────────┐        ┌──────────────┐
│ Claude cowork│        │ Supabase Edge Function │        │  Postgres    │
│  or Desktop  │  POST  │   contentlab-mcp       │  RPC   │ articles,    │
│  (MCP client)├───────>│   (Deno + JSON-RPC)    ├───────>│ social_posts,│
└──────────────┘        │                        │        │ api_keys     │
                        │ wraps 4 existing tools │        └──────────────┘
                        └───────────┬────────────┘
                                    │ fetch()
                                    ▼
                     ┌───────────────────────────────┐
                     │ Other edge functions:          │
                     │  - generate-article (SSE)      │
                     │  - process-scheduled-posts     │
                     │  - linkedin-publish            │
                     └───────────────────────────────┘
```

Key files:
- `supabase/functions/contentlab-mcp/index.ts` — the server
- `supabase/functions/generate-api-key/index.ts` — mints `cl_` keys
- `src/pages/Settings/APIKeys.tsx` — UI for generating/revoking keys
- `docs/mcp-quickstart.md` — end-user setup guide

## 3. The four tools we expose

| Tool | What it does | Implementation |
|---|---|---|
| `create_article` | Generates a full SEO article + saves it | Calls `generate-article`, parses its SSE stream, inserts into `articles` table |
| `list_articles` | Browse the library | Direct `supabase.from("articles").select()` |
| `list_social_posts` | Browse drafts/scheduled/posted | Direct `supabase.from("social_posts").select()` |
| `schedule_social_post` | Queue a LinkedIn post for a future time | Direct insert into `social_posts` with `status='scheduled'` |

The `process-scheduled-posts` cron worker (already existing) picks up
scheduled rows every minute and posts to LinkedIn — no MCP involvement once
the row is inserted.

## 4. How we built it (in order)

### Step 1 — API-key auth
MCP needed per-user auth. We reused the `cl_`-prefixed key pattern already
used by `framer-sync-articles`:
- `api_keys` table: `{ key, user_id, last_used_at, created_at }`
- `generate-api-key` edge function mints `cl_` + 32 random bytes
- Settings → API Keys UI to generate/revoke

The MCP server's `authenticate()` function accepts either `cl_` or a JWT
(JWTs only for local `supabase functions invoke` testing).

### Step 2 — JSON-RPC routing
Implemented the minimum MCP surface:
- `initialize` — handshake, advertises `capabilities.tools`
- `notifications/initialized` — no-op
- `tools/list` — returns the 4 tools with JSON Schema
- `tools/call` — dispatches to a handler, returns `{content: [{type:"text", text: JSON.stringify(...)}]}`
- `resources/list`, `prompts/list` — stubbed empty (stop probing clients from seeing `-32601`)
- `ping` — just `{}`

### Step 3 — The hard one: `create_article`
This took three iterations because `generate-article` is a **streaming-only**
edge function — it pipes Perplexity's SSE response straight through and never
writes to the DB. The browser UI consumes the stream and calls
`articles.insert()` itself.

- **v1:** awaited `generate-article` in the JSON-RPC handler → timed out at 60s
  because Perplexity takes 60–120s.
- **v2:** moved the fetch into `EdgeRuntime.waitUntil()` so the HTTP response
  returns immediately → credits deducted but articles never appeared.
- **v3 (shipped):** in the background task, read the SSE stream ourselves,
  accumulate `choices[0].delta.content` deltas, parse `<h1>` for title and
  `<!--META_JSON_START...META_JSON_END-->` for meta, then
  `admin.from("articles").insert()`. Returns `status: "started"` so the client
  knows to poll `list_articles`.

### Step 4 — Config + docs
- `supabase/config.toml`: `[functions.contentlab-mcp] verify_jwt = false`
  (we do our own auth)
- `docs/mcp-quickstart.md`: user-facing setup instructions for Claude cowork
  and Claude Desktop (via `mcp-remote` bridge).

## 5. What you need to build your own MCP

The minimum viable MCP server is surprisingly small:

1. **A single HTTP POST endpoint** that handles JSON-RPC 2.0
2. **Implement five methods**: `initialize`, `tools/list`, `tools/call`,
   `notifications/initialized` (no-op), `ping`
3. **Auth scheme** — Bearer token is the simplest. MCP spec supports OAuth
   2.1 for richer flows.
4. **Tool definitions** with JSON Schema for inputs
5. **Return `{content: [{type: "text", text: ...}]}` from tool calls** — the
   `text` can be JSON-stringified structured data; Claude parses it.

That's it. No SDK required (though Anthropic publishes one for Python/TS if
you want). Our whole server is ~560 lines of Deno TypeScript.

## 6. Current distribution: custom connector only

Today, to use Content Lab MCP you have to **manually add it as a custom
connector**:

- **Claude cowork:** Settings → Connectors → Add custom connector → paste URL
  + bearer key
- **Claude Desktop:** edit `claude_desktop_config.json` with the `mcp-remote`
  npm bridge snippet

Users must generate a `cl_` key in Content Lab first and copy/paste it. Works
end-to-end but not discoverable — only people we tell about it will find it.

## 7. What it takes to go mainstream (public Claude connector directory)

Anthropic's public connector directory is the list users see in Settings →
Connectors without needing to paste URLs. Getting listed requires:

### A. OAuth 2.1, not bearer tokens
Public connectors must use OAuth. The MCP spec requires:
- `/.well-known/oauth-authorization-server` metadata endpoint
- `/authorize` endpoint (consent screen)
- `/token` endpoint (exchange code → access token)
- PKCE support
- Dynamic client registration (`/register`), or allowlist-based

**Why:** users shouldn't paste API keys into Claude. OAuth gives each
Claude install its own scoped token, revocable from Content Lab.

**Our rough plan:** build an `oauth` edge function that issues short-lived
access tokens bound to a Content Lab user; the tools would validate these
like they currently validate `cl_` keys.

### B. Submission to Anthropic
Per Anthropic's current process (docs at
`https://docs.claude.com/en/docs/agents-and-tools/mcp-connectors`):
1. Implement OAuth 2.1 and verify it against the MCP inspector
2. Fill out the connector submission form (includes: display name, icon,
   description, privacy policy URL, terms URL, OAuth endpoints)
3. Security review — Anthropic verifies scope behavior, token handling,
   data access patterns
4. If approved, the connector appears in the public directory

### C. Production-readiness checks we'd want
- **Rate limiting** on the MCP endpoint — today we rely on Supabase's
  default limits; public traffic warrants per-key throttling
- **Audit log** — which tool was called by which user, when
- **Observability** — structured logs + an alert when `create_article`
  background tasks silently fail
- **More tools** — newsletter generation, update-article, improve-article.
  These edge functions exist but need `cl_` key support added (they currently
  only accept JWT)
- **Multi-platform publish** — Twitter/Facebook/Instagram scheduling
  (`process-scheduled-posts` currently only handles LinkedIn)
- **LinkedIn company pages** — today `linkedin_connections` only stores the
  personal `linkedin_id`; adding company-page posting requires the
  `w_organization_social` OAuth scope and an `author_type` /
  `organization_urn` column. See the LinkedIn section in the roadmap.

## 8. Testing checklist for the current server

End-to-end smoke test from scratch:

```bash
# 1. Generate an API key in Settings → API Keys, copy it
KEY=cl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
URL=https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp

# 2. Initialize
curl -s $URL -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'

# 3. List tools
curl -s $URL -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 4. Start an article
curl -s $URL -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_article","arguments":{"topic":"Test topic"}}}'

# 5. Wait ~90s, then list
curl -s $URL -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_articles","arguments":{"limit":5}}}'
```

## 9. Roadmap

| Priority | Item | Effort |
|---|---|---|
| P0 | Fix Claude Desktop docs (done — uses `mcp-remote`) | 15min |
| P1 | OAuth 2.1 implementation for public directory | ~3 days |
| P1 | LinkedIn company-page posting | ~1 day |
| P2 | Expose newsletter, improve-article, generate-ideas as MCP tools | ~half day per tool |
| P2 | Multi-platform scheduling (Twitter, Instagram, Facebook) | ~1 week (requires new OAuth flows per platform) |
| P3 | Submit to Anthropic connector directory | ~2 days review turnaround |

---

*Last updated: 2026-04-13 (v4 of `contentlab-mcp` edge function — adds SSE
stream parsing so articles actually save.)*
