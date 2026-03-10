-- Drop existing overly permissive write policies and recreate with authenticated-only access

-- ai_settings
DROP POLICY IF EXISTS "Public insert ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Public update ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Public delete ai_settings" ON public.ai_settings;

CREATE POLICY "Authenticated insert ai_settings" ON public.ai_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update ai_settings" ON public.ai_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete ai_settings" ON public.ai_settings FOR DELETE TO authenticated USING (true);

-- articles
DROP POLICY IF EXISTS "Public insert articles" ON public.articles;
DROP POLICY IF EXISTS "Public update articles" ON public.articles;
DROP POLICY IF EXISTS "Public delete articles" ON public.articles;

CREATE POLICY "Authenticated insert articles" ON public.articles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update articles" ON public.articles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete articles" ON public.articles FOR DELETE TO authenticated USING (true);

-- brand_assets
DROP POLICY IF EXISTS "Public insert brand_assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Public update brand_assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Public delete brand_assets" ON public.brand_assets;

CREATE POLICY "Authenticated insert brand_assets" ON public.brand_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update brand_assets" ON public.brand_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete brand_assets" ON public.brand_assets FOR DELETE TO authenticated USING (true);

-- content_ideas
DROP POLICY IF EXISTS "Public insert content_ideas" ON public.content_ideas;
DROP POLICY IF EXISTS "Public update content_ideas" ON public.content_ideas;
DROP POLICY IF EXISTS "Public delete content_ideas" ON public.content_ideas;

CREATE POLICY "Authenticated insert content_ideas" ON public.content_ideas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update content_ideas" ON public.content_ideas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete content_ideas" ON public.content_ideas FOR DELETE TO authenticated USING (true);

-- social_post_ideas
DROP POLICY IF EXISTS "Public insert social_post_ideas" ON public.social_post_ideas;
DROP POLICY IF EXISTS "Public update social_post_ideas" ON public.social_post_ideas;
DROP POLICY IF EXISTS "Public delete social_post_ideas" ON public.social_post_ideas;

CREATE POLICY "Authenticated insert social_post_ideas" ON public.social_post_ideas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update social_post_ideas" ON public.social_post_ideas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete social_post_ideas" ON public.social_post_ideas FOR DELETE TO authenticated USING (true);

-- social_posts
DROP POLICY IF EXISTS "Public insert social_posts" ON public.social_posts;
DROP POLICY IF EXISTS "Public update social_posts" ON public.social_posts;
DROP POLICY IF EXISTS "Public delete social_posts" ON public.social_posts;

CREATE POLICY "Authenticated insert social_posts" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update social_posts" ON public.social_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete social_posts" ON public.social_posts FOR DELETE TO authenticated USING (true);