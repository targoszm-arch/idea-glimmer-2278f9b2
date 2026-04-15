
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS video_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reel-videos', 'reel-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for reel videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reel-videos');

CREATE POLICY "Authenticated upload for reel videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reel-videos');

CREATE POLICY "Anon upload for reel videos"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'reel-videos');
