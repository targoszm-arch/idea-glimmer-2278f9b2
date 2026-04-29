-- Knowledge Base articles use a special URL pattern on skillstudio.ai:
--   /help/knowledge-base/{slug}/documentation-articles
-- The previous migration keyed off content_type, but most KB articles are
-- stored as content_type='blog' with category='Knowledge Base' / 'Knowledge-Base'.
-- Fix the URL by category.

UPDATE public.articles
SET url_path = 'help/knowledge-base/' || slug || '/documentation-articles'
WHERE slug IS NOT NULL
  AND slug <> ''
  AND lower(regexp_replace(coalesce(category, ''), '[^a-zA-Z0-9]+', '-', 'g'))
      LIKE 'knowledge-base%';
