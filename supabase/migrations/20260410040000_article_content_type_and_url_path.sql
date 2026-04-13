-- Track content type (blog / user_guide / how_to) on each article so the
-- slug/url_path can be built dynamically. Previously content_type only
-- lived in frontend state and was lost on save.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'blog',
  ADD COLUMN IF NOT EXISTS url_path text;

-- url_path is the full URL path for this article, computed from
-- content_type + category + slug. Rules:
--   user_guide, how_to -> help/knowledge-base/{slug}/documentation-articles
--   blog               -> {category-slug}/{slug}
-- (category-slug is the category lowercased with spaces replaced by "-")
COMMENT ON COLUMN public.articles.content_type IS 'blog | user_guide | how_to';
COMMENT ON COLUMN public.articles.url_path IS 'Full URL path: e.g. "instructional-design/3-ways-to-elevate-online-courses" or "help/knowledge-base/how-to-use-screen-templates/documentation-articles". Safe to use as Framer CMS slug.';

-- Backfill url_path for existing articles.
-- Strip accents/punctuation, collapse whitespace+dashes, lowercase.
CREATE OR REPLACE FUNCTION public._kebab(txt text) RETURNS text AS $$
DECLARE
  s text;
BEGIN
  IF txt IS NULL OR length(trim(txt)) = 0 THEN
    RETURN 'article';
  END IF;
  s := lower(txt);
  -- Replace any non-alphanumeric run with a single dash, trim dashes
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  IF length(s) = 0 THEN RETURN 'article'; END IF;
  RETURN substr(s, 1, 80);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE public.articles
SET url_path = CASE
  WHEN content_type IN ('user_guide', 'how_to')
    THEN 'help/knowledge-base/' || public._kebab(COALESCE(NULLIF(slug, ''), title)) || '/documentation-articles'
  WHEN COALESCE(NULLIF(category, ''), '') != ''
    THEN public._kebab(category) || '/' || public._kebab(COALESCE(NULLIF(slug, ''), title))
  ELSE
    public._kebab(COALESCE(NULLIF(slug, ''), title))
END
WHERE url_path IS NULL OR url_path = '';

CREATE INDEX IF NOT EXISTS articles_url_path_idx ON public.articles (url_path);
