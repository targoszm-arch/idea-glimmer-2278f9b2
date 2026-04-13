-- Add missing columns to social_posts needed by the schedule UI and Calendar/Library views.
-- Without these, inserts from SocialPostPreviewModal fail silently and scheduled posts
-- never appear on the Calendar or in the Social Library.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS article_title text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text;

-- Index for Calendar's scheduled_at ordering and filter
CREATE INDEX IF NOT EXISTS social_posts_scheduled_at_idx
  ON public.social_posts (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Index for user + status filters
CREATE INDEX IF NOT EXISTS social_posts_user_status_idx
  ON public.social_posts (user_id, status);

COMMENT ON COLUMN public.social_posts.scheduled_at IS 'When the post should be sent. NULL = not scheduled / draft.';
COMMENT ON COLUMN public.social_posts.status IS 'draft | scheduled | sent | failed';
