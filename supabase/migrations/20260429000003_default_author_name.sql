-- Default author name set in AI Settings, used to prefill new articles
-- and to backfill old articles that were saved without an author.
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS default_author_name TEXT;
