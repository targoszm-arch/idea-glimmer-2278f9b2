-- Create brand_assets table
CREATE TABLE public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'visual',
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

-- Allow all access (no auth)
CREATE POLICY "Allow all access to brand_assets" ON public.brand_assets
  FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true);

-- Storage RLS policies
CREATE POLICY "Allow public read brand-assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-assets');

CREATE POLICY "Allow public insert brand-assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brand-assets');

CREATE POLICY "Allow public delete brand-assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'brand-assets');