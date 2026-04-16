// OAuth 2.1 / MCP discovery metadata endpoints.
//
// Serves two documents that Claude reads during connector setup:
//
//   GET /functions/v1/mcp-oauth-metadata/.well-known/oauth-authorization-server
//     RFC 8414 authorization-server metadata. Tells Claude where to send
//     users for /authorize, where to exchange codes for tokens, and which
//     code_challenge methods we support.
//
//   GET /functions/v1/mcp-oauth-metadata/.well-known/oauth-protected-resource
//     RFC 9728 protected-resource metadata for the MCP endpoint. Points
//     back to the authorization server above.
//
// Both are public JSON documents — no auth required.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  // Expose standard OAuth/MCP response headers so browser-based clients
  // (Claude's connector UI) can read them from JS.
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

// Public endpoints — these match the Supabase project ref. They're
// hard-coded because the values go into signed JWT claims and must stay
// stable across deployments.
const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
const APP_URL = "https://www.app.content-lab.ie";

const MCP_URL = `${SUPABASE_URL}/functions/v1/contentlab-mcp`;
const AUTH_URL = `${APP_URL}/oauth/authorize`;
const TOKEN_URL = `${SUPABASE_URL}/functions/v1/mcp-oauth-token`;
const REGISTER_URL = `${SUPABASE_URL}/functions/v1/mcp-oauth-register`;

// RFC 8414 authorization-server metadata. The `issuer` must exactly
// match the signing claim in access-token JWTs issued by mcp-oauth-token.
const AUTHORIZATION_SERVER_METADATA = {
  issuer: MCP_URL,
  authorization_endpoint: AUTH_URL,
  token_endpoint: TOKEN_URL,
  registration_endpoint: REGISTER_URL,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"], // public clients (Claude)
  scopes_supported: ["mcp"],
  service_documentation: `${APP_URL}/connect/claude`,
};

// RFC 9728 protected-resource metadata. Advertises the MCP endpoint as
// a protected resource that accepts tokens from the authorization
// server above.
const PROTECTED_RESOURCE_METADATA = {
  resource: MCP_URL,
  authorization_servers: [MCP_URL],
  scopes_supported: ["mcp"],
  bearer_methods_supported: ["header"],
  resource_documentation: `${APP_URL}/connect/claude`,
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Match the well-known paths regardless of how Supabase prefixes them.
  if (path.endsWith("/.well-known/oauth-authorization-server")) {
    return json(AUTHORIZATION_SERVER_METADATA);
  }
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json(PROTECTED_RESOURCE_METADATA);
  }

  return json({ error: "not_found" }, 404);
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
