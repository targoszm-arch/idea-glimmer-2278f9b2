

## Fix article deletion: double-click bug + Framer cleanup

### Problems identified

1. **"Need to delete twice"** — The `handleDelete` in `EditArticle.tsx` navigates to `/` (Dashboard) after deleting. But the Dashboard only fetches articles once on mount (`useEffect(() => fetchArticles(), [])`). When navigating back from edit, React may reuse the existing mounted Dashboard component, so the stale article list persists. The user sees the article still there, clicks delete again (this time from the card, going back to edit), and it's already gone — causing confusion.

2. **"Toast appears" issue** — The `confirm()` dialog may be interfering with the toast display flow, and the navigation happens immediately after the toast fires, potentially swallowing it.

3. **No Framer cleanup** — When an article is deleted, its `framer_item_id` is lost and nothing removes it from the Framer CMS collection. The `publish-to-framer` function only supports upsert, not delete.

### Plan

**File 1: `src/pages/Dashboard.tsx`** — Re-fetch articles on navigation focus
- Add a re-fetch when the component gains focus or when navigating back, using `useEffect` with a dependency on `location.key` (from `useLocation`) so the article list refreshes every time the user lands on the dashboard.

**File 2: `src/pages/EditArticle.tsx`** — Add Framer deletion before DB delete
- In `handleDelete`, before deleting from Supabase:
  - Check if the article has a `framer_item_id`
  - If yes, call a new edge function `delete-from-framer` to remove the item from the Framer CMS collection
  - Then proceed with the Supabase delete
  - Use `navigate("/", { replace: true })` to ensure Dashboard remounts

**File 3: `supabase/functions/delete-from-framer/index.ts`** — New edge function
- Accepts `{ framer_item_id: string }` in the request body
- Connects to the Framer project using existing secrets (`FRAMER_PROJECT_URL`, `FRAMER_API_TOKEN`, `FRAMER_COLLECTION_ID`)
- Finds and removes the item from the collection by ID
- Returns success/failure (non-blocking — article deletion proceeds even if Framer cleanup fails)
- Includes auth check and CORS headers matching existing patterns

**File 4: `supabase/config.toml`** — Add `verify_jwt = false` for the new function

### What stays the same
- ArticleCard component — no changes needed
- publish-to-framer function — untouched
- Database schema — no changes

