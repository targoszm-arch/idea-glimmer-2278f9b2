

## Plan: Create a Make CMS Sync-compatible webhook endpoint

The Make CMS Sync plugin expects a **GET endpoint** that returns a **JSON array** of objects. The plugin then lets you map each JSON key to a Framer CMS field (Text, Rich Text, Image URL, etc.). Your existing `framer-sync-articles` function wraps data in `{ ok, count, articles }` — the plugin likely expects a flat array at the top level.

### What to build

**1. New Edge Function: `make-webhook`**

A simple GET endpoint that returns published articles as a **flat JSON array** with clean, mappable field names:

```json
[
  {
    "title": "Article Title",
    "slug": "article-slug",
    "body": "<h1>...</h1><p>...</p>",
    "excerpt": "Short summary...",
    "meta_description": "SEO description",
    "category": "Marketing",
    "cover_image": "https://...",
    "published_date": "2026-03-12T00:00:00Z"
  }
]
```

- Queries `articles` table filtered to `status = 'published'`
- Returns flat array (no wrapper object) for direct plugin compatibility
- Uses `SUPABASE_SERVICE_ROLE_KEY` so no auth required from the plugin side
- `verify_jwt = false` in config.toml since the plugin calls it externally
- CORS headers included

**2. Update `supabase/config.toml`** to add the new function with `verify_jwt = false`.

### How to use it

1. Install the Make CMS Sync plugin in your Framer project
2. Paste the webhook URL: `https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/make-webhook`
3. Click "Test" — the plugin fetches your articles and shows available fields
4. Map fields: `title` → Text, `body` → Rich Text, `cover_image` → Image URL, `published_date` → Date, etc.
5. Click "Sync Now" to import

No database changes needed. One new edge function, one config.toml update.

