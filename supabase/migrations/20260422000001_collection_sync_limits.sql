-- Add collection_id to user_integrations so each Framer collection
-- is tracked as a separate registered slot per user.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS collection_id TEXT;

-- Backfill from existing metadata jsonb for Framer rows
UPDATE public.user_integrations
SET collection_id = metadata->>'collection_id'
WHERE platform = 'framer'
  AND collection_id IS NULL
  AND metadata->>'collection_id' IS NOT NULL;

-- Unique constraint so we can upsert cleanly and count slots accurately.
-- NULL collection_id rows (legacy rows without a collection) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_integrations_user_platform_collection
  ON public.user_integrations (user_id, platform, collection_id)
  WHERE collection_id IS NOT NULL;
