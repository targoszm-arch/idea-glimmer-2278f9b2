-- Recalculate url_path for all articles using the correct formula:
--   blog / newsletter  → {category-slug}/{article-slug}
--   user_guide / how_to → help/knowledge-base/{slug}/documentation-articles
--
-- URL patterns on skillstudio.ai:
--   /features-updates/{slug}
--   /course-authoring/{slug}
--   /industry-news/{slug}
--   /compliance-training/{slug}
--
-- Previous bugs caused doubled prefixes like:
--   "features-updates/features-updates-ai-literacy-..." (wrong)
-- The fix: derive url_path purely from category + slug, never from Framer slugs.

-- Helper: convert a string to URL-safe kebab-case (mirrors toSlug() in slug.ts)
CREATE OR REPLACE FUNCTION public._to_url_slug(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(input),
      '[^a-z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  );
$$;

-- Fix blog / newsletter articles
UPDATE public.articles
SET url_path =
  public._to_url_slug(coalesce(nullif(trim(category), ''), 'features-updates'))
  || '/' || slug
WHERE content_type IN ('blog', 'newsletter')
  AND slug IS NOT NULL
  AND slug <> '';

-- Fix user_guide / how_to articles
UPDATE public.articles
SET url_path = 'help/knowledge-base/' || slug || '/documentation-articles'
WHERE content_type IN ('user_guide', 'how_to')
  AND slug IS NOT NULL
  AND slug <> ''
  AND (url_path IS NULL OR url_path NOT LIKE 'help/knowledge-base/%/documentation-articles');

DROP FUNCTION public._to_url_slug(TEXT);
