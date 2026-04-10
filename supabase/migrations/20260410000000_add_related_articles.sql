-- Add related_article_ids column to allow per-article related-article references
-- This powers a multi-collection-reference field in Framer CMS so each article
-- can specify which other articles to show as "related" or "read next"
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS related_article_ids text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.articles.related_article_ids IS
  'Array of article UUIDs that this article references as "related articles". Synced to Framer as a multiCollectionReference field.';
