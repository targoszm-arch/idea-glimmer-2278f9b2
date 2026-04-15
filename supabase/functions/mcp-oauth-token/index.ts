// OAuth 2.1 token endpoint — exchanges authorization codes and refresh
// tokens for access tokens. Two grants supported:
//
//   grant_type=authorization_code
//     body: client_id, code, redirect_uri, code_verifier
//     validates the PKCE code_verifier against the stored code_challenge,
//     then issues a 90-min access_token (JWT) + 30-day refresh_token.
//
//   grant_type=refresh_token
//     body: client_id, refresh_token
//     rotates the refresh token and issues a new access_token.
//
// Access tokens are HS256 JWTs signed with MCP_OAUTH_SIGNING_KEY. Claims:
//   iss   — SUPABASE_URL (matches authorization-server metadata)
//   aud   — MCP endpoint URL (RFC 8707 audience restriction)
//   sub   — auth.users.id
//   cid   — oauth client_id
//   iat / exp
//
// The contentlab-mcp function verifies these tokens on every request.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const MCP_URL = `${SUPABASE_URL}/functions/v1/contentlab-mcp`;

const ACCESS_TOKEN_TTL_SECONDS = 90 * 60; // 90 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const AUTH_CODE_TTL_SECONDS = 10 * 60; // 10 minutes (already enforced at issue time, defensive)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return tokenError("invalid_request", "method_not_allowed", 405);
  }

  const contentType = req.headers.get("content-type") ?? "";
  const params = contentType.includes("application/x-www-form-urlencoded")
    ? new URLSearchParams(await req.text())
    : new URLSearchParams(Object.entries(await safeJson(req)).map(([k, v]) => [k, String(v)]));

  const grantType = params.get("grant_type");
  if (!grantType) {
    return tokenError("invalid_request", "grant_type is required");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (grantType === "authorization_code") {
      return await handleAuthorizationCode(params, admin);
    }
    if (grantType === "refresh_token") {
      return await handleRefreshToken(params, admin);
    }
    return tokenError("unsupported_grant_type", `grant_type "${grantType}" is not supported`);
  } catch (e) {
    console.error("token endpoint error:", e);
    return tokenError("server_error", e instanceof Error ? e.message : "unknown error", 500);
  }
});

// ---------------------------------------------------------------------------
// authorization_code grant
// ---------------------------------------------------------------------------
async function handleAuthorizationCode(params: URLSearchParams, admin: ReturnType<typeof createClient>) {
  const clientId = params.get("client_id");
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (!clientId || !code || !redirectUri || !codeVerifier) {
    return tokenError(
      "invalid_request",
      "client_id, code, redirect_uri, and code_verifier are all required",
    );
  }

  // Load the authorization code. Constant-time comparison isn't needed
  // because the code itself is an opaque 32-byte random lookup key.
  const { data: row, error } = await admin
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !row) {
    return tokenError("invalid_grant", "authorization code not found");
  }
  if (row.consumed_at) {
    return tokenError("invalid_grant", "authorization code has already been used");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return tokenError("invalid_grant", "authorization code has expired");
  }
  if (row.client_id !== clientId) {
    return tokenError("invalid_grant", "client_id does not match the authorization code");
  }
  if (row.redirect_uri !== redirectUri) {
    return tokenError("invalid_grant", "redirect_uri does not match");
  }

  // PKCE S256 verification: SHA-256 the verifier and compare to the stored
  // challenge. We only support S256 — `plain` is disallowed by OAuth 2.1.
  if (row.code_challenge_method !== "S256") {
    return tokenError("invalid_grant", "only S256 code_challenge_method is supported");
  }
  const computedChallenge = await sha256Base64url(codeVerifier);
  if (computedChallenge !== row.code_challenge) {
    return tokenError("invalid_grant", "code_verifier does not match code_challenge");
  }

  // Mark the code consumed so a replay returns invalid_grant.
  await admin
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code);

  return issueTokens({
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope ?? "mcp",
    admin,
  });
}

// ---------------------------------------------------------------------------
// refresh_token grant
// ---------------------------------------------------------------------------
async function handleRefreshToken(params: URLSearchParams, admin: ReturnType<typeof createClient>) {
  const clientId = params.get("client_id");
  const refreshToken = params.get("refresh_token");

  if (!clientId || !refreshToken) {
    return tokenError("invalid_request", "client_id and refresh_token are required");
  }

  const { data: row, error } = await admin
    .from("oauth_refresh_tokens")
    .select("*")
    .eq("token", refreshToken)
    .maybeSingle();

  if (error || !row) return tokenError("invalid_grant", "refresh token not found");
  if (row.revoked_at) return tokenError("invalid_grant", "refresh token has been revoked");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return tokenError("invalid_grant", "refresh token has expired");
  }
  if (row.client_id !== clientId) {
    return tokenError("invalid_grant", "client_id does not match the refresh token");
  }

  // Rotate: mark the current refresh token revoked, then issue a new pair.
  await admin
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", refreshToken);

  return issueTokens({
    userId: row.user_id,
    clientId: row.client_id,
    scope: "mcp",
    admin,
  });
}

// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------
async function issueTokens(opts: {
  userId: string;
  clientId: string;
  scope: string;
  admin: ReturnType<typeof createClient>;
}): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenExp = now + ACCESS_TOKEN_TTL_SECONDS;

  const accessToken = await signJwt({
    iss: SUPABASE_URL,
    aud: MCP_URL,
    sub: opts.userId,
    cid: opts.clientId,
    scope: opts.scope,
    iat: now,
    exp: accessTokenExp,
  });

  const refreshToken = "mcpr_" + randomBase64url(32);
  const refreshExpiresAt = new Date((now + REFRESH_TOKEN_TTL_SECONDS) * 1000).toISOString();

  const { error } = await opts.admin.from("oauth_refresh_tokens").insert({
    token: refreshToken,
    client_id: opts.clientId,
    user_id: opts.userId,
    expires_at: refreshExpiresAt,
  });

  if (error) {
    console.error("refresh_token insert failed:", error);
    return tokenError("server_error", error.message, 500);
  }

  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: opts.scope,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tokenError(error: string, description: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function sha256Base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

function randomBase64url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

function base64url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return base64url(bytes);
}

// HS256 JWT signing. We use Web Crypto so no Deno-only deps.
async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get("MCP_OAUTH_SIGNING_KEY");
  if (!secret) throw new Error("MCP_OAUTH_SIGNING_KEY is not configured");

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlFromString(JSON.stringify(header));
  const encodedPayload = base64urlFromString(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64url(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}
