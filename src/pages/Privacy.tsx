// Content Lab privacy policy. Rendered at /privacy. Public — no auth.
//
// Linked from:
//   - Footer (via src/components/Footer.tsx)
//   - Anthropic MCP directory submission form (required field)
//
// Keep content factual and current. Update the "last updated" date when
// material changes ship.

export default function Privacy() {
  return (
    <div className="container max-w-3xl py-12 text-foreground">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mb-8 text-sm text-muted-foreground">Last updated: April 15, 2026</p>

      <Section title="What we collect">
        <p>Content Lab collects the following categories of data:</p>
        <ul>
          <li>
            <strong>Account data</strong> — email address, hashed password, and account
            preferences you set in the app.
          </li>
          <li>
            <strong>Content you create</strong> — articles, social posts, newsletter
            drafts, and related metadata. Stored in our database so you can edit and
            publish it.
          </li>
          <li>
            <strong>Usage data</strong> — tool invocations via our MCP server (which tool,
            when, how long it took, success or error). Redacted of any credentials before
            storage. Used for rate limiting and debugging.
          </li>
          <li>
            <strong>Integration data</strong> — OAuth tokens and account identifiers for
            third-party services you connect (LinkedIn, Resend, Framer, Intercom, Notion).
            Stored encrypted and used only to perform actions you've asked for.
          </li>
          <li>
            <strong>Billing data</strong> — processed by Stripe. We store a customer ID
            and subscription status; we never see your card details.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To run the features you use — generating content, scheduling posts, sending newsletters, syncing to integrations.</li>
          <li>To enforce per-account credit balances and rate limits.</li>
          <li>To debug and improve the product.</li>
          <li>To contact you about account, billing, or security issues.</li>
        </ul>
        <p>We do not sell your data. We do not use your content to train AI models.</p>
      </Section>

      <Section title="Who processes it on our behalf">
        <p>
          We use subprocessors to run the service. Your content may pass through them
          while you're using a feature:
        </p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, file storage, edge functions.</li>
          <li><strong>Perplexity</strong> — article and social post generation (text only).</li>
          <li><strong>OpenAI</strong> — cover image generation (DALL-E 3), only when explicitly requested.</li>
          <li><strong>Resend</strong> — newsletter delivery.</li>
          <li><strong>Stripe</strong> — billing.</li>
          <li><strong>Vercel</strong> — hosting the web app.</li>
          <li><strong>Anthropic</strong> — when you use Content Lab via the Claude MCP connector, prompts and tool calls pass through Anthropic's inference infrastructure.</li>
        </ul>
      </Section>

      <Section title="MCP connector data flow">
        <p>
          If you connect Content Lab to Claude as an MCP server, Claude reads and writes
          your Content Lab data according to the OAuth scope you approved. Every tool
          invocation is logged to an audit table (tool name, duration, success/error). We
          do not log the content of messages Claude sends you or the full tool responses
          — only the fields we need to enforce rate limits and investigate incidents.
        </p>
        <p>
          You can revoke Claude's access any time from <a className="underline" href="/settings/api-key">Settings → API Keys</a> or by disconnecting the connector in Claude's settings.
        </p>
      </Section>

      <Section title="Retention">
        <ul>
          <li>Content you create is retained as long as your account is active.</li>
          <li>Audit logs of MCP tool invocations are retained for 90 days, then purged.</li>
          <li>On account deletion, all of your content and integration tokens are permanently removed within 30 days.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can export or delete your data at any time from <a className="underline" href="/settings">Settings</a>,
          or by emailing <a className="underline" href="mailto:support@content-lab.ie">support@content-lab.ie</a>. EU/UK users:
          you have GDPR rights of access, rectification, erasure, restriction, portability, and objection.
        </p>
      </Section>

      <Section title="Security">
        <p>
          TLS everywhere, database at rest encrypted, secrets stored in environment
          variables or Supabase secrets, OAuth tokens row-scoped by user ID. Sensitive
          tables (OAuth client registry, audit log, refresh tokens) are accessible only
          to our service role — end users never read them directly.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Email <a className="underline" href="mailto:support@content-lab.ie">support@content-lab.ie</a>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 [&_p]:mb-3 [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul>li]:text-sm [&_ul>li]:text-muted-foreground [&_ul>li]:leading-relaxed [&_a]:text-primary [&_strong]:text-foreground">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
