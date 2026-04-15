// RFC 7591 Dynamic Client Registration endpoint.
//
// Claude's connector flow calls this endpoint during setup to register
// itself as an OAuth client. We accept any request with a valid
// `redirect_uris` array and issue a fresh public `client_id`. No
// client_secret — these are public clients (Claude runs in the user's
// browser), which is why PKCE is mandatory at the /authorize step.
//
// Request body (per RFC 7591):
//   {
//     "client_name": "Claude",
//     "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
//     "token_endpoint_auth_method": "none",
//     "grant_types": ["authorization_code", "refresh_token"],
//     "response_types": ["code"]
//   }
//
// Response:
//   {
//     "client_id": "...",
//     "client_name": "...",
//     "redirect_uris": [...],
//     "token_endpoint_auth_method": "none",
//     "client_id_issued_at": <unix ts>
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request", error_description: "body must be JSON" }, 400);
  }

  const clientName =
    typeof body?.client_name === "string" && body.client_name.length > 0
      ? body.client_name.slice(0, 100)
      : "MCP Client";

  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0 || !redirectUris.every((u: unknown) => typeof u === "string")) {
    return json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be a non-empty array of strings",
      },
      400,
    );
  }

  // Every redirect URI must be HTTPS. We don't allow http://, custom
  // schemes, or loopback here — only hosted clients like claude.ai.
  for (const uri of redirectUris as string[]) {
    if (!/^https:\/\//.test(uri)) {
      return json(
        {
          error: "invalid_redirect_uri",
          error_description: `redirect_uri must be https:// — got ${uri}`,
        },
        400,
      );
    }
  }

  const clientId = generateClientId();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
  });

  if (error) {
    console.error("oauth_clients insert failed:", error);
    return json({ error: "server_error", error_description: error.message }, 500);
  }

  return json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    201,
  );
});

// Cryptographically random 32-byte client_id, base64url encoded.
function generateClientId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "mcpc_" + base64url(bytes);
}

function base64url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
