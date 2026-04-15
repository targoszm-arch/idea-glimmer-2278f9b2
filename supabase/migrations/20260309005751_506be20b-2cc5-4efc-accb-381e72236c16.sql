-- Add Framer item reference so we can update existing CMS items on re-publish
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS framer_item_id text;