-- Fix automation_runs: SET NULL on article delete (not block)
ALTER TABLE public.automation_runs 
  DROP CONSTRAINT IF EXISTS automation_runs_article_id_fkey;
ALTER TABLE public.automation_runs
  ADD CONSTRAINT automation_runs_article_id_fkey 
  FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE SET NULL;
