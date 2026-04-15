# Content Lab — MCP Directory Submission Package

Internal reference doc. Use this when filling out the submission form at
<https://www.anthropic.com/partners/mcp> for Anthropic's MCP Connector
Directory.

## Listing metadata

| Field | Value |
|---|---|
| **Connector name** | Content Lab |
| **Short description** | Draft articles, schedule LinkedIn posts, and queue newsletters from Claude. |
| **Long description** | Content Lab is a content creation SaaS for founders, marketers, and teams who want to move faster without losing brand voice. Connect it to Claude and you can draft SEO-ready articles (1,500–2,000 words), edit them inline, schedule LinkedIn posts for the right moment, and queue one-time newsletter sends — all without leaving the chat. Nine tools in total. Your articles, your voice, your publishing calendar; Claude does the heavy lifting. |
| **Category** | Content / Productivity |
| **Icon (512×512)** | `public/brand-logo.png` (if dimensions qualify, else produce a 512×512 export) |
| **Homepage URL** | <https://www.app.content-lab.ie> |
| **Setup / docs URL** | <https://www.app.content-lab.ie/connect/claude> |
| **Privacy policy URL** | <https://www.app.content-lab.ie/privacy> |
| **Terms of service URL** | <https://www.app.content-lab.ie/terms> |
| **Support contact URL** | <https://www.app.content-lab.ie/support> |
| **Support email** | support@content-lab.ie |

## Technical endpoints

| Field | Value |
|---|---|
| **MCP server URL** | `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/contentlab-mcp` |
| **Transport** | Streamable HTTP (single POST, JSON-RPC 2.0) |
| **Protocol version** | `2025-06-18` |
| **Authorization** | OAuth 2.1 with PKCE + RFC 7591 DCR |
| **Authorization server metadata** | `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/mcp-oauth-metadata/.well-known/oauth-authorization-server` |
| **Protected resource metadata** | `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/mcp-oauth-metadata/.well-known/oauth-protected-resource` |
| **OAuth callback expected** | `https://claude.ai/api/mcp/auth_callback` |
| **Token audience (RFC 8707)** | MCP endpoint URL (enforced at verification) |

## Testing account

Create a dedicated test account and include credentials in the submission
email. Seed it with:

- 3 sample articles (1 published, 1 draft, 1 scheduled)
- 2 scheduled LinkedIn posts
- 1 scheduled newsletter with a Resend audience
- Enough credits to exercise `create_article` and `generate_cover_image` at
  least once

Use a mailbox you control. Include the login in a private reply on the
submission thread, not in the public form.

## Three worked example prompts

Paste these into the submission form as "example usage".

### Example 1 — Draft and schedule

> "Use Content Lab to draft an SEO article titled 'How to onboard a new hire
> in the first 30 days' in a professional tone. When it's done, schedule a
> LinkedIn post about it for 9 AM UK time on the next weekday."

Expected behaviour: Claude calls `create_article` (returns `status: started`),
waits or polls `list_articles` until the article shows up, then calls
`schedule_social_post` with the article ID and the computed timestamp.

### Example 2 — Edit an existing article

> "Find the article I drafted yesterday about remote onboarding and rewrite
> the intro so it opens with a specific story instead of a generic claim."

Expected behaviour: `list_articles` → `get_article` for the match →
`update_article` with a revised `content` field.

### Example 3 — Schedule a newsletter to an audience

> "Send my 'Weekly insights' article to my Resend audience next Tuesday at
> 10 AM. Subject line: 'Three things I changed this week'."

Expected behaviour: `list_articles` (find by title) → `schedule_newsletter`
with `audience_type: 'resend_list'`, the resend audience ID, subject override,
and computed `scheduled_at`.

## Policy compliance notes (unsolicited, pre-empt reviewer questions)

- **AI media generation**: `create_article` can optionally call DALL-E 3 for
  a cover image, but **only** when the caller explicitly passes
  `generate_cover_image: true`. Default is off. This is to align with the
  directory policy's prohibition on AI-generated media while preserving the
  feature for users who explicitly ask for it via Claude.
- **Cross-service orchestration**: Content Lab integrates with LinkedIn and
  Resend, but only to perform actions you explicitly scheduled *inside*
  Content Lab. It's not a general automation platform; Claude can't use
  Content Lab to act on arbitrary third-party services.
- **Financial transactions**: None. Billing (Stripe) is web-app-only; no MCP
  tool writes a charge.
- **Rate limiting**: 120 tool calls/hour per user by default, enforced
  server-side via `check_mcp_rate_limit`. Overrideable per account in
  `mcp_rate_limits.hourly_limit`.
- **Audit log**: every tool call writes a row to `mcp_tool_invocations` with
  tool name, auth method, duration, and redacted arguments. Retained 90 days.
- **Tool annotations**: every tool declares `title`, `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, `openWorldHint` per MCP 2025-06-18.

## Open items before submission

- [ ] Verify `public/brand-logo.png` is at least 512×512 and square. Produce
      `public/mcp-directory-icon.png` otherwise.
- [ ] Confirm the test account credentials to include in the submission
      email.
- [ ] Take 2–3 screenshots of Content Lab in action for the submission form
      (if requested).
- [ ] Set `MCP_OAUTH_SIGNING_KEY` secret in production Supabase project.
- [ ] Smoke-test the full OAuth flow from claude.ai end-to-end.
- [ ] Submit via <https://www.anthropic.com/partners/mcp>.

## Post-submission

Watch for Anthropic's reply. Expect questions on:
- Cover-image generation (pre-emptively addressed above).
- Data retention for MCP audit logs.
- How users revoke connector access (answered in /privacy and /connect/claude).
