// Content Lab support page. Rendered at /support. Public — no auth.
//
// Linked from the Anthropic MCP directory submission form (required field)
// and from the app footer.

import { Mail, BookOpen, Zap } from "lucide-react";

export default function Support() {
  return (
    <div className="container max-w-3xl py-12 text-foreground">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Support</h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Something broken? Not sure how a feature works? We're here.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          icon={<Mail className="h-5 w-5 text-primary" />}
          title="Email us"
          body={
            <>
              <a className="underline text-primary" href="mailto:support@content-lab.ie">
                support@content-lab.ie
              </a>
              <br />
              We aim to reply within one business day (GMT).
            </>
          }
        />
        <Card
          icon={<Zap className="h-5 w-5 text-primary" />}
          title="Service status"
          body={
            <>
              Supabase, Perplexity, Resend, or LinkedIn having a bad day? Those outages
              hit us too. If Content Lab itself is down we'll post an update at{" "}
              <a className="underline text-primary" href="mailto:support@content-lab.ie">
                support@content-lab.ie
              </a>
              .
            </>
          }
        />
        <Card
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          title="Connect Claude"
          body={
            <>
              Setting up the MCP connector? See the step-by-step guide at{" "}
              <a className="underline text-primary" href="/connect/claude">
                /connect/claude
              </a>
              .
            </>
          }
        />
        <Card
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          title="Security & privacy"
          body={
            <>
              How we handle your data: <a className="underline text-primary" href="/privacy">Privacy Policy</a>
              <br />
              Our terms of service: <a className="underline text-primary" href="/terms">Terms</a>
            </>
          }
        />
      </div>

      <section className="mt-10 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 text-base font-semibold text-foreground">Common issues</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="text-foreground">401 Unauthorized from the MCP endpoint:</strong>{" "}
            your API key was revoked or never existed. Generate a new one at{" "}
            <a className="underline text-primary" href="/settings/api-key">Settings → API Keys</a>.
          </li>
          <li>
            <strong className="text-foreground">Rate-limited (error -32000):</strong>{" "}
            you've hit the default 120 MCP calls/hour. Wait for the retry window or email
            us to raise your quota.
          </li>
          <li>
            <strong className="text-foreground">LinkedIn post didn't publish:</strong>{" "}
            your LinkedIn OAuth token probably expired. Reconnect LinkedIn from{" "}
            <a className="underline text-primary" href="/settings/integrations">
              Settings → Integrations
            </a>
            .
          </li>
          <li>
            <strong className="text-foreground">Out of credits:</strong>{" "}
            top up from <a className="underline text-primary" href="/settings">Settings</a>.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2">{icon}</div>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
