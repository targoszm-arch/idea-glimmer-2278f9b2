-- Add Notion and Shopify integration columns to articles table
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS notion_page_id text,
  ADD COLUMN IF NOT EXISTS shopify_article_id text;

COMMENT ON COLUMN articles.notion_page_id IS 'Notion page ID for synced articles';
COMMENT ON COLUMN articles.shopify_article_id IS 'Shopify article ID for synced articles';
