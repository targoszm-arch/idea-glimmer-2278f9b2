

## Add per-article Intercom collection picker

### What changes

1. **Edge function** (`supabase/functions/sync-to-intercom/index.ts`):
   - Before creating a new article, fetch all collections from `GET https://api.intercom.io/help_center/collections` and return them if a new query param/body field `list_collections: true` is passed
   - Accept an optional `parent_id` field in the request body
   - Include `parent_id` in the Intercom create payload when provided (only on create, not update — Intercom doesn't allow moving articles between collections via update)

2. **Edit article page** (`src/pages/EditArticle.tsx`):
   - Add state for `intercomCollections` (fetched list) and `selectedCollectionId`
   - On page load (or when clicking "Sync to Intercom" for a new sync), call the edge function with `list_collections: true` to fetch available collections
   - Show a dropdown/select next to the "Sync to Intercom" button letting the user pick a collection before syncing
   - Pass the selected `parent_id` in the sync request body
   - When article already has an `intercom_article_id` (update), skip collection selection since the article is already placed

### Technical details

- Intercom Collections API: `GET https://api.intercom.io/help_center/collections` returns `{ data: [{ id, name, ... }] }`
- The `parent_id` field on Intercom's create article endpoint places the article into that collection
- The edge function handles two modes: `list_collections: true` returns collections list; otherwise syncs the article with optional `parent_id`
- No database changes needed — the collection is only relevant at sync time

