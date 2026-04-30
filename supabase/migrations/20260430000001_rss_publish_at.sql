-- Optional scheduled time for an article to appear in the RSS feed.
-- NULL = appear immediately (existing behavior). Future timestamp =
-- the article is held back from the feed until that time, so Zapier /
-- LinkedIn pick it up on the chosen date instead of when it's published.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS rss_publish_at TIMESTAMPTZ;

-- Helps the rss-feed query filter quickly when the table grows.
CREATE INDEX IF NOT EXISTS idx_articles_rss_publish_at
  ON public.articles (user_id, rss_publish_at)
  WHERE rss_enabled = true;
