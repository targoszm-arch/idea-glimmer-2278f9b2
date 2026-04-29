-- Re-derive url_path for ALL articles from category + slug, regardless of
-- content_type. Catches articles the previous migration skipped because their
-- content_type was NULL or set to a value other than 'blog'/'newsletter'.
--
-- Removes phantom path roots that were created by old, hardcoded code:
--   latest-articles/, latest-article/, product-comparisons/, product-tutorials/,
--   industry-updates/, buying-guides/  → all rewritten under the article's
--   actual category slug.
--
-- Knowledge-base / how-to articles keep the special help/knowledge-base/
-- shape; everything else becomes {category-slug}/{slug}.

CREATE OR REPLACE FUNCTION public._to_url_slug(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(coalesce(input, '')),
      '[^a-z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  );
$$;

-- Knowledge-base style paths
UPDATE public.articles
SET url_path = 'help/knowledge-base/' || slug || '/documentation-articles'
WHERE content_type IN ('user_guide', 'how_to')
  AND slug IS NOT NULL
  AND slug <> '';

-- Everything else → {category-slug}/{slug}
UPDATE public.articles
SET url_path =
  public._to_url_slug(coalesce(nullif(trim(category), ''), 'features-updates'))
  || '/' || slug
WHERE (content_type IS NULL OR content_type NOT IN ('user_guide', 'how_to'))
  AND slug IS NOT NULL
  AND slug <> '';

DROP FUNCTION public._to_url_slug(TEXT);
