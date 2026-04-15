-- Truncate any existing meta_description values over 150 characters.
-- This ensures the new editable UI with a 150-char limit can display
-- existing articles cleanly.
UPDATE public.articles
SET meta_description = LEFT(meta_description, 150)
WHERE LENGTH(meta_description) > 150;
