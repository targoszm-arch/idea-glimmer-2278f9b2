-- Tighten storage write policies. Uploads/deletes are handled via Edge Functions using service role.

-- article-covers: keep public read only
DROP POLICY IF EXISTS "Authenticated users can upload article covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update article covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete article covers" ON storage.objects;

-- brand-assets: keep public read only
DROP POLICY IF EXISTS "Allow public insert brand-assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete brand-assets" ON storage.objects;

-- reel-videos: keep public read only
DROP POLICY IF EXISTS "Anon upload for reel videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload for reel videos" ON storage.objects;