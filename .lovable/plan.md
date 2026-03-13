

## Plan: Upload custom cover images + Intercom article sync

### Part 1: Custom Cover Image Upload

Currently the cover image area only offers "Generate AI Cover Image." We'll add an "Upload Image" option alongside it.

**How it works:**
- Add an upload button (and drag-drop zone) next to the AI generate button in both `NewArticle.tsx` and `EditArticle.tsx`
- When a file is selected, send it as base64 to a new edge function `upload-article-cover` that uploads to the existing `article-covers` storage bucket (which is already public, and per security policy, uploads go through edge functions with service role)
- Return the public URL and set it as `coverImageUrl`

**Files:**
- **New**: `supabase/functions/upload-article-cover/index.ts` -- accepts base64 file, uploads to `article-covers` bucket, returns public URL
- **Edit**: `src/pages/NewArticle.tsx` -- add file input + "Upload Image" button in the cover image section
- **Edit**: `src/pages/EditArticle.tsx` -- same upload button

### Part 2: Intercom Article Sync

The Intercom Articles API (`POST https://api.intercom.io/articles`) requires:
- `title` (required)
- `author_id` (required, integer -- must be a teammate ID in Intercom)
- `body` (HTML string)
- `description` (maps to our `excerpt`)
- `state` ("published" or "draft")

**Key consideration:** `author_id` is an Intercom admin/teammate integer ID, not a name. You'll need to provide your Intercom admin ID and API token.

**Implementation:**
- **New**: `supabase/functions/sync-to-intercom/index.ts` -- edge function that takes an article ID, fetches it from the DB, and POSTs/PUTs to Intercom's API. Stores the returned Intercom article ID in a new `intercom_article_id` column for future updates (PUT instead of POST).
- **DB migration**: add `intercom_article_id text` column to `articles` table
- **Secrets needed**: `INTERCOM_API_TOKEN` (bearer token) and `INTERCOM_AUTHOR_ID` (default admin teammate ID)
- **UI**: Add a "Sync to Intercom" button in both article editors, next to "Publish"
- The function will use `PUT /articles/{id}` if `intercom_article_id` exists (update), or `POST /articles` for new articles (create)

**API mapping:**

| Our field | Intercom field |
|---|---|
| `title` | `title` |
| `excerpt` | `description` |
| `content` (HTML) | `body` |
| `status` | `state` |
| Configured secret | `author_id` |

### Files touched

- **New**: `supabase/functions/upload-article-cover/index.ts`
- **New**: `supabase/functions/sync-to-intercom/index.ts`
- **Migration**: add `intercom_article_id text` to `articles`
- **Edit**: `src/pages/NewArticle.tsx` -- upload button + Intercom sync button
- **Edit**: `src/pages/EditArticle.tsx` -- same
- **Edit**: `src/lib/supabase.ts` -- add `intercom_article_id` to Article type

### Prerequisites

Before implementing Intercom sync, two secrets are needed:
1. **INTERCOM_API_TOKEN** -- your Intercom API access token (Settings > Developers > Access Token)
2. **INTERCOM_AUTHOR_ID** -- the numeric ID of the Intercom admin who should be the article author (find via `GET /admins` endpoint)

