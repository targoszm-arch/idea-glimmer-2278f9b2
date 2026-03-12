CREATE TABLE public.category_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.category_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read category_labels" ON public.category_labels FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated insert category_labels" ON public.category_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete category_labels" ON public.category_labels FOR DELETE TO authenticated USING (true);

INSERT INTO public.category_labels (name) VALUES
  ('Marketing'),
  ('Product'),
  ('Engineering'),
  ('Sales Enablement'),
  ('Compliance'),
  ('Thought Leadership'),
  ('How-To'),
  ('Comparison'),
  ('Case Study'),
  ('Industry News');