-- Create RLS policies for article-covers bucket

-- Allow anyone to view article cover images (public bucket)
CREATE POLICY "Article covers are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'article-covers');

-- Allow authenticated users to upload article covers
CREATE POLICY "Authenticated users can upload article covers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'article-covers');

-- Allow authenticated users to update article covers
CREATE POLICY "Authenticated users can update article covers"
ON storage.objects FOR UPDATE
USING (bucket_id = 'article-covers');

-- Allow authenticated users to delete article covers
CREATE POLICY "Authenticated users can delete article covers"
ON storage.objects FOR DELETE
USING (bucket_id = 'article-covers');