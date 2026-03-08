

## Redesign Social Media Module to Match Content Ideas Workflow

### Current Problems
1. Posts are saved via `document.getElementById("social-output")?.textContent` which is unreliable and often saves empty strings
2. No persistence UI -- generated posts disappear when switching tabs
3. Single post generation instead of bulk idea generation

### New Design

Mirror the Content Ideas workflow: first generate multiple post ideas (headline + description), display them as cards, then generate full content from each idea on demand.

**Database changes:**
- New table `social_post_ideas` with columns: `id`, `platform`, `topic`, `title_suggestion`, `description`, `status` (unused/used), `post_id` (nullable FK to social_posts), `created_at`
- Keep existing `social_posts` table, add `title` column for the headline

**New edge function: `generate-social-ideas`**
- Similar to `generate-ideas` but for social media
- Accepts `{ platform, niche, app_description, app_audience, tone, tone_description, reference_urls }`
- Returns JSON array of 5-8 post ideas per platform, each with `title` and `description`
- Non-streaming (like `generate-ideas`)

**Updated `generate-social-post` function:**
- No changes needed to the edge function itself, it already generates full content

**Redesigned `SocialMedia.tsx` page:**
- Each platform subtab shows:
  1. A "Generate Ideas" form (niche/topic input + generate button) at the top
  2. A grid of idea cards below (fetched from `social_post_ideas` filtered by platform)
  3. Each card shows title + description + "Generate Post" button
  4. Clicking "Generate Post" streams the full content, saves to `social_posts`, links back via `post_id`
  5. Card then shows "View Post" button which expands/shows the full generated content inline
- Previously generated ideas and posts persist across tab switches (loaded from DB on mount)

**File changes:**

| File | Action |
|------|--------|
| DB migration | Create `social_post_ideas` table, add `title` to `social_posts` |
| `supabase/functions/generate-social-ideas/index.ts` | Create |
| `supabase/config.toml` | Add function config |
| `src/pages/SocialMedia.tsx` | Rewrite to match Content Ideas pattern |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

