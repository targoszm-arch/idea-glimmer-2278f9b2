

## Fix: Deleted articles not removed from Framer CMS

### Root cause

No `framer_item_id` is ever saved to the `articles` table. The `publish-to-framer` edge function returns it in its response, but nothing writes it back to the DB. So when `handleDelete` in EditArticle checks `if (framerItemId)`, it's always null — the Framer cleanup is always skipped.

### Fix approach

**1. `supabase/functions/publish-to-framer/index.ts`** — Save `framer_item_id` back to DB after publishing

After the successful publish (line ~211–226), use a service-role Supabase client to update the article record with the returned `framer_item_id`:

```
UPDATE articles SET framer_item_id = <saved.id> WHERE id = <articleId>
```

This ensures every future publish stores the Framer CMS item ID.

**2. `supabase/functions/delete-from-framer/index.ts`** — Add slug-based fallback

Currently only accepts `framer_item_id`. Add support for `slug` as well: if no `framer_item_id` is provided, look up the item in the Framer collection by slug and remove it. This handles articles published before the fix.

**3. `src/pages/EditArticle.tsx`** — Always attempt Framer cleanup

Change the delete handler to call `delete-from-framer` regardless of whether `framerItemId` is set — pass both `framer_item_id` (if available) and `slug` so the edge function can find and remove the item either way.

### What stays the same
- `delete-from-framer` auth, CORS, WebSocket patch — untouched
- Dashboard refresh fix from previous change — kept
- `scripts/publish-to-framer.js` — untouched (it doesn't save back either, but it's a standalone tool)

