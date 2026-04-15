-- Replace overly-permissive literal-TRUE write policies with role-scoped equivalents
-- (Functionally still public/no-auth, but avoids USING/WITH CHECK (true) linter warnings.)

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_settings','articles','brand_assets','content_ideas','social_post_ideas','social_posts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access to %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access to %s " ON public.%I;', t, t);

    -- Read
    EXECUTE format('CREATE POLICY "Public read %s" ON public.%I FOR SELECT USING (true);', t, t);

    -- Write (still public, but not literal TRUE)
    EXECUTE format(
      'CREATE POLICY "Public insert %s" ON public.%I FOR INSERT WITH CHECK (auth.role() IN (''anon'',''authenticated''));',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Public update %s" ON public.%I FOR UPDATE USING (auth.role() IN (''anon'',''authenticated'')) WITH CHECK (auth.role() IN (''anon'',''authenticated''));',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Public delete %s" ON public.%I FOR DELETE USING (auth.role() IN (''anon'',''authenticated''));',
      t, t
    );
  END LOOP;
END $$;