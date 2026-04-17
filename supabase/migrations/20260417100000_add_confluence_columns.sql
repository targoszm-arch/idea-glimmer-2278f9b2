-- Track the Confluence page ID on each article so subsequent publishes
-- become updates (PUT) instead of duplicates (POST). Same pattern as
-- intercom_article_id, notion_page_id, shopify_article_id, etc.

alter table public.articles
  add column if not exists confluence_page_id text;

-- Also remember which Confluence space + cloud the page lives in, so
-- the sync function doesn't have to re-select the space on every update.
alter table public.articles
  add column if not exists confluence_space_id text;

alter table public.articles
  add column if not exists confluence_cloud_id text;
