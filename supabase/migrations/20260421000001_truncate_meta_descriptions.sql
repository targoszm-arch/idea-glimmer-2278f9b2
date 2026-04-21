-- Truncate existing meta_descriptions that exceed 155 characters.
-- New saves are already capped at 150 in the UI, but older rows may be longer.
UPDATE public.articles
SET meta_description = left(meta_description, 155)
WHERE length(meta_description) > 155;

-- Add a DB-level constraint to enforce the limit going forward.
ALTER TABLE public.articles
  ADD CONSTRAINT articles_meta_description_length
  CHECK (length(meta_description) <= 160);
