-- LinkedIn RSS feed support.
-- rss_enabled: user opts individual articles into the RSS feed.
-- rss_token:   per-user secret appended to the public feed URL so no
--              auth is needed (LinkedIn polls the URL server-side).

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS rss_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS rss_token text;
