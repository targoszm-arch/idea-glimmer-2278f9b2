import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verifies the JWT in the Authorization header belongs to a valid Supabase user.
 * Throws a 401 Response if auth fails — catch it and return it directly.
 *
 * Usage:
 *   const { userId } = await requireAuth(req).catch(r => { return r })
 *   if (authResult instanceof Response) return authResult;
 */
export async function requireAuth(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw unauthorizedResponse("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw unauthorizedResponse("Invalid or expired token");
  }

  return { userId: user.id };
}

function unauthorizedResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    }
  );
}
