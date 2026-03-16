

## Fix: Remove auth from Framer-facing edge functions

### Problem
The previous security hardening added JWT user authentication to **all** edge functions, including three that are called by external services (Framer plugin, Make webhook) which have no user session. These must remain public endpoints.

### Functions to fix
Remove the auth check block (lines 16-25) from these three functions:

1. **`supabase/functions/framer-sync-articles/index.ts`** — Called by the Framer plugin with just the anon key, no user token
2. **`supabase/functions/framer-probe/index.ts`** — Called by the Framer plugin to test connectivity
3. **`supabase/functions/make-webhook/index.ts`** — Called by Make.com integration, no user session

For each, remove the auth check block and use the service role key directly (as they did before) for database access. These are legitimately public endpoints that serve published article data to external integrations.

