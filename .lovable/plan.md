

## Fix Framer Edge Functions: Build Error + Auto-fetch Credentials

### Problems

1. **Build error**: All three Framer functions use `npm:framer-api@0.1.2` which Deno cannot resolve. Must switch to `https://esm.sh/framer-api@0.1.2`.

2. **Duplicate auth block in `publish-to-framer`**: Lines 84-95 redeclare `authHeader`, `user`, and `authError` — causing a runtime crash. Must remove.

3. **`delete-from-framer` and `reconcile-framer` use hardcoded env vars** (`FRAMER_PROJECT_URL`, `FRAMER_API_KEY`, `FRAMER_COLLECTION_ID`) instead of reading the user's saved credentials from `user_integrations`. Only `publish-to-framer` reads from the DB.

### Changes

#### 1. `supabase/functions/publish-to-framer/index.ts`
- Remove duplicate auth block (lines 84-95)
- Replace both `npm:framer-api@0.1.2` imports with `https://esm.sh/framer-api@0.1.2`

#### 2. `supabase/functions/delete-from-framer/index.ts`
- Replace hardcoded env var lookups (lines 83-85) with a DB lookup from `user_integrations` using the authenticated user's ID (same pattern as publish-to-framer)
- Replace `npm:framer-api@0.1.2` with `https://esm.sh/framer-api@0.1.2`

#### 3. `supabase/functions/reconcile-framer/index.ts`
- Replace hardcoded env var lookups (lines 79-81) with a DB lookup from `user_integrations` using the authenticated user's ID
- Replace `npm:framer-api@0.1.2` with `https://esm.sh/framer-api@0.1.2`

### Credential resolution pattern (applied to all 3 functions)

```typescript
const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { data: integration } = await adminSupabase
  .from("user_integrations")
  .select("access_token, platform_user_name, metadata")
  .eq("user_id", user.id)
  .eq("platform", "framer")
  .single();

if (!integration) {
  throw new Error("Framer not connected. Go to Settings → Integrations.");
}

const FRAMER_PROJECT_URL = integration.metadata?.project_url ?? integration.platform_user_name;
const FRAMER_API_KEY = integration.metadata?.api_key ?? integration.access_token;
const FRAMER_COLLECTION_ID = integration.metadata?.collection_id ?? env("FRAMER_COLLECTION_ID");
```

This means each user's own Framer credentials (saved via the Integrations page) are used automatically — no global env vars needed.

