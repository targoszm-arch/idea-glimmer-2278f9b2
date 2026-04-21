UPDATE public.articles
SET meta_description = left(meta_description, 155)
WHERE length(meta_description) > 155;

ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_meta_description_length;

ALTER TABLE public.articles
  ADD CONSTRAINT articles_meta_description_length
  CHECK (length(meta_description) <= 160);
