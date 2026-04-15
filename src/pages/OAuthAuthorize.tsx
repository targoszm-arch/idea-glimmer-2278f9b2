// OAuth 2.1 consent screen for MCP connector authorization.
//
// Claude (or any other OAuth client that registered via DCR) bounces the
// user here to approve access to their Content Lab account. The URL
// carries the standard OAuth params:
//
//   /oauth/authorize
//     ?client_id=<from DCR>
//     &redirect_uri=https://claude.ai/api/mcp/auth_callback
//     &response_type=code
//     &code_challenge=<PKCE S256>
//     &code_challenge_method=S256
//     &state=<opaque>
//     &scope=mcp
//
// If the user is logged out we store the full URL and bounce through
// /login, then come back and auto-reload. On "Allow" we call the
// create_mcp_auth_code RPC (SECURITY DEFINER; enforces user + client
// validity) and 302 the browser back to redirect_uri with ?code= and
// ?state=.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldCheck, ExternalLink } from "lucide-react";

interface OAuthParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
}

interface ClientInfo {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

export default function OAuthAuthorize() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [params, setParams] = useState<OAuthParams | null>(null);
  const [paramError, setParamError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Parse + validate the OAuth params on mount.
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const clientId = q.get("client_id");
    const redirectUri = q.get("redirect_uri");
    const responseType = q.get("response_type") ?? "code";
    const codeChallenge = q.get("code_challenge");
    const codeChallengeMethod = q.get("code_challenge_method") ?? "S256";
    const state = q.get("state") ?? "";
    const scope = q.get("scope") ?? "mcp";

    if (!clientId || !redirectUri || !codeChallenge) {
      setParamError(
        "Missing required parameters. This page must be opened via an OAuth flow — " +
          "direct visits are not supported.",
      );
      return;
    }
    if (responseType !== "code") {
      setParamError(`Unsupported response_type: ${responseType}`);
      return;
    }
    if (codeChallengeMethod !== "S256") {
      setParamError("Only S256 code_challenge_method is supported.");
      return;
    }

    setParams({
      clientId,
      redirectUri,
      responseType,
      codeChallenge,
      codeChallengeMethod,
      state,
      scope,
    });
  }, []);

  // If the user is logged out, stash the current URL and bounce to
  // /login. They'll come back here after authenticating.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      sessionStorage.setItem("mcp_oauth_return_to", window.location.pathname + window.location.search);
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Load the client's display name + verify the redirect_uri is one of
  // the ones registered during DCR. A mismatch here is fatal — we never
  // redirect to an unregistered URI even if the user clicks Allow.
  useEffect(() => {
    if (!params || !user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_mcp_client_for_consent", {
        p_client_id: params.clientId,
      });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setClientError(
          "This OAuth client is not registered. The app that sent you here may need to re-register.",
        );
        setLoadingClient(false);
        return;
      }
      const clientRow: ClientInfo = data[0];
      if (!clientRow.redirect_uris.includes(params.redirectUri)) {
        setClientError(
          `This redirect URI is not registered for "${clientRow.client_name}". ` +
            "Refusing to continue.",
        );
        setLoadingClient(false);
        return;
      }
      setClient(clientRow);
      setLoadingClient(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params, user]);

  async function handleAllow() {
    if (!params || !client) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("create_mcp_auth_code", {
        p_client_id: params.clientId,
        p_redirect_uri: params.redirectUri,
        p_code_challenge: params.codeChallenge,
        p_code_challenge_method: params.codeChallengeMethod,
        p_scope: params.scope,
      });
      if (error || !data) throw new Error(error?.message ?? "Failed to create authorization code");

      const redirect = new URL(params.redirectUri);
      redirect.searchParams.set("code", data as unknown as string);
      if (params.state) redirect.searchParams.set("state", params.state);
      window.location.replace(redirect.toString());
    } catch (e: any) {
      setSubmitError(e?.message ?? "Something went wrong");
      setSubmitting(false);
    }
  }

  function handleDeny() {
    if (!params) return;
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "The user denied the authorization request");
    if (params.state) redirect.searchParams.set("state", params.state);
    window.location.replace(redirect.toString());
  }

  // ---- UI ----------------------------------------------------------------

  if (paramError) {
    return (
      <ErrorShell
        title="Invalid authorization request"
        body={paramError}
      />
    );
  }

  if (authLoading || !user || !params || loadingClient) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clientError) {
    return <ErrorShell title="Authorization blocked" body={clientError} />;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Authorize access</h1>
        </div>

        <p className="mb-4 text-sm text-foreground">
          <span className="font-medium">{client?.client_name}</span> wants to connect
          to your Content Lab account.
        </p>

        <div className="mb-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">If you approve, this app will be able to:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Read and create articles in your library</li>
            <li>List your scheduled social posts and newsletters</li>
            <li>Schedule LinkedIn posts on your behalf</li>
            <li>Schedule one-time newsletter sends to your audience</li>
          </ul>
          <p className="mt-3">
            Access can be revoked any time from{" "}
            <a className="underline hover:text-foreground" href="/settings/api-key">
              Settings → API Keys
            </a>
            .
          </p>
        </div>

        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Returning to:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {new URL(params.redirectUri).host}
          </code>
        </div>

        {submitError && (
          <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {submitError}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={handleAllow}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Allow
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
      </div>
    </div>
  );
}

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-destructive/30 bg-card p-6 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-destructive">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
