

## Plan: Enforce 64-character slug limit by generating shorter titles

### Problem
Framer CMS item IDs (mapped to `slug`) have a 64-character max. Long article titles produce slugs that exceed this, causing sync failures.

### Approach
Rather than truncating slugs (which looks broken), we fix at the source: instruct the AI to generate titles under ~60 characters, and cap slug generation in code as a safety net.

### Changes

**1. `supabase/functions/generate-article/index.ts`** — Add title length constraint to system prompt

Add to the OUTPUT FORMAT section:
```
CRITICAL: The article title in the <h1> tag MUST be under 60 characters. Keep titles concise and punchy. Never exceed 60 characters for the title.
```

**2. `src/pages/NewArticle.tsx`** — Cap slug at 64 chars (safety net)

Change the slug generation line (~line 241) to trim to 64 chars at a word boundary:
```ts
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 64).replace(/-+$/, "");
```

**3. `src/pages/EditArticle.tsx`** — Same slug safety net (~line 94-97)

**4. `src/pages/ContentIdeas.tsx`** — Same slug safety net (~line 209)

**5. `supabase/functions/make-webhook/index.ts`** — Add slug safety net in the webhook output too:
```ts
slug: (a.slug ?? "").substring(0, 64).replace(/-+$/, ""),
```

### Summary
- AI will generate shorter titles (under 60 chars) going forward
- All slug generation points get a 64-char safety cap (won't truncate titles, only slugs)
- Existing long-slug articles will be safely handled by the webhook

