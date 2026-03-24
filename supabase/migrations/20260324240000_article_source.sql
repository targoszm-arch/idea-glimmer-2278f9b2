ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS automation_name text;
-- Tag any existing articles that came from automation_runs
UPDATE public.articles a
SET source = 'automation'
WHERE EXISTS (
  SELECT 1 FROM public.automation_runs ar WHERE ar.article_id = a.id
);
