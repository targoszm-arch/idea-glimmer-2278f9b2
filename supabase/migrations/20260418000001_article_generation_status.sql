-- Track MCP article generation progress. create_article returns immediately
-- with status: "started"; the background job flips generation_status to
-- 'complete' or 'failed'. Callers poll via get_article / list_articles.

alter table public.articles
  add column if not exists generation_status text default 'complete';

alter table public.articles
  add column if not exists generation_error text;
