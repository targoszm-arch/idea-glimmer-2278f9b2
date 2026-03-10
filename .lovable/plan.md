

## Plan: Fix Social Media Markdown + Add Cover Image to Article Preview

### Problem 1: Social media posts generated with broken markdown
The `generate-social-post` edge function prompts include markdown formatting instructions (`##`, `###`, `**`, etc.) for LinkedIn, YouTube, Twitter, and Instagram Reel platforms. When users copy the generated text into social platforms, the raw markdown syntax appears as broken text.

**Fix:** Update the platform prompts in `supabase/functions/generate-social-post/index.ts` to explicitly instruct the AI to output plain text only — no markdown, no hashtag symbols used as headers, no bold markers. The Instagram carousel prompt already outputs JSON so it's fine. Blog article generation is unaffected (separate function).

Platforms to update:
- **linkedin** (lines 9-18): Remove markdown structure references, instruct plain text with line breaks only
- **youtube** (lines 20-40): Remove `##` header instructions, use plain labeled sections instead
- **twitter** (lines 42-53): Already mostly plain text, minor cleanup
- **instagram_reel** (lines 82-101): Remove `##`, `###`, `**` formatting instructions
- **instagram_reel_multipage** (lines 103-137): Remove markdown formatting instructions

Add a global instruction like: `"IMPORTANT: Output plain text only. Do not use any markdown formatting (no #, ##, **, *, -, etc.). Use line breaks and spacing for structure instead."`

### Problem 2: Cover image not showing on Article preview page
Looking at `Article.tsx` (line 85-88), the article content is rendered via `dangerouslySetInnerHTML` but the `cover_image_url` field is never displayed. In contrast, `EditArticle.tsx` shows the cover image.

**Fix:** Add the cover image banner to `Article.tsx`, rendered between the date and the article content (around line 83), conditionally when `article.cover_image_url` exists:
```
{article.cover_image_url && (
  <img src={article.cover_image_url} alt={article.title} className="w-full rounded-lg mb-8" />
)}
```

### Files to modify
1. `supabase/functions/generate-social-post/index.ts` — Update all non-carousel platform prompts to enforce plain text output
2. `src/pages/Article.tsx` — Add cover image display before article content

