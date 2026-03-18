

## Bulk Reconcile: Remove stale articles from Framer CMS

### Problem
Two articles were deleted from the app before the Framer cleanup was implemented. They still exist in Framer CMS and cannot be removed from the app since the records are gone.

### Solution
Create a **reconcile-framer** edge function and a **Dashboard button** to trigger it.

### Changes

**1. New edge function: `supabase/functions/reconcile-framer/index.ts`**
- Connects to Framer using existing secrets (`FRAMER_PROJECT_URL`, `FRAMER_API_TOKEN`, `FRAMER_COLLECTION_ID`)
- Fetches all items from the Framer CMS collection
- Fetches all current article slugs from the `articles` table (using service role)
- Compares: any Framer item whose slug is NOT in the DB articles list is orphaned
- Removes all orphaned items in one `collection.removeItems()` call
- Returns list of removed slugs and count
- Auth: requires authenticated user (same pattern as delete-from-framer)

**2. `supabase/config.toml`** — add `[functions.reconcile-framer]` with `verify_jwt = false`

**3. `src/pages/Dashboard.tsx`** — add a "Sync Framer" button next to "New Article"
- Small secondary button with a refresh icon
- On click: calls the reconcile-framer function
- Shows toast with count of removed stale items (or "Framer is clean" if none)
- Loading state while running

### What stays the same
- `delete-from-framer` — still used for individual article deletions
- `publish-to-framer` — untouched
- Framer plugin sync — untouched (it only pushes published articles)

