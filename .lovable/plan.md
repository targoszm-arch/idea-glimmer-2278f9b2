

## Plan: Fix Build Error + Use Meta Description for Cover Image Prompt

### Two issues to fix:

**1. Missing dependency: `@tiptap/extension-table-cell`**
The package is imported in `NewArticle.tsx` and `EditArticle.tsx` but not listed in `package.json`. The other three table extensions are present — this one was missed.

| File | Change |
|------|--------|
| `package.json` | Add `"@tiptap/extension-table-cell": "^3.20.1"` to dependencies |

**2. Use `meta_description` instead of full content for cover image prompt**
Currently `EditArticle.tsx` sends `title` as the prompt (line 154). For articles that already have content, we should use `meta_description` (which is short, ~255 chars max) as the prompt — it captures the article's essence and stays well within DALL-E's 4,000 character limit.

| File | Change |
|------|--------|
| `src/pages/EditArticle.tsx` | Change `imagePrompt` from `title.trim()` to `metaDescription.trim() \|\| title.trim()` — use meta description when available, fall back to title |
| `src/pages/NewArticle.tsx` | Same change — prefer meta description over title for the cover image prompt |
| `src/pages/ContentIdeas.tsx` | Check and apply same pattern if applicable |

### Safety
The meta description is capped at 255 characters, so the final DALL-E prompt (template prefix + meta description) will be well under the 4,000 character limit.

