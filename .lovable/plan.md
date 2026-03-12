## Plan: Add author, reading time, and FAQ fields to articles and expose them in the webhook

### Problem

The `articles` table lacks `author_name`, `reading_time_minutes`, and `faq_html` columns. The webhook currently doesn't expose these, and `slug` / `meta_description` are already present but need to stay included.  


### Changes

**1. Database migration — add 3 new columns to `articles**`

```sql
ALTER TABLE public.articles
  ADD COLUMN author_name text NOT NULL DEFAULT '',
  ADD COLUMN reading_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN faq_html text NOT NULL DEFAULT '';
```

No new RLS policies needed — existing policies cover all operations on `articles`.

**2. Update `src/lib/supabase.ts` — add new fields to Article type**

Add `author_name`, `reading_time_minutes`, and `faq_html` to the `Article` type.

**3. Update `src/pages/NewArticle.tsx` — compute and save new fields on save**

- **Author name**: pull from `supabase.auth.getUser()` email (or a future profile name) and store it. Add a text input for the author name field in the editor form.
- **Reading time**: compute from word count (`Math.ceil(wordCount / 200)`) at save time.
- **FAQ extraction**: extract the FAQ section from generated HTML (everything from `<h2>` containing "FAQ" to end of content) and store it separately in `faq_html`, while keeping it in `content` too.
- Include all three new fields in the `.insert()` call.

**4. Update `src/pages/EditArticle.tsx**` — same: persist author_name, recalculate reading_time, extract FAQ on save.

**5. Update `src/pages/Article.tsx**` — display author name and reading time in the article view header.

**6. Update `supabase/functions/make-webhook/index.ts` — expose all fields**

Update the select query and mapping to include:

```json
{
  "title": "...",
  "slug": "...",
  "body": "...",
  "excerpt": "...",
  "meta_description": "...",
  "category": "...",
  "cover_image": "...",
  "published_date": "...",
  "author_name": "...",
  "reading_time_minutes": 5,
  "faq": "<div class='faq-item'>...</div>"
}
```

All fields will then be mappable in the Framer Make CMS Sync plugin.

7. remove "HTML" word appearing on top of the article ine the body of the article

### Files touched

- `supabase/migrations/` — new migration SQL
- `src/lib/supabase.ts` — Article type update
- `src/pages/NewArticle.tsx` — author input, reading time calc, FAQ extraction, save
- `src/pages/EditArticle.tsx` — same updates for editing
- `src/pages/Article.tsx` — display author + reading time
- `supabase/functions/make-webhook/index.ts` — expose new fields