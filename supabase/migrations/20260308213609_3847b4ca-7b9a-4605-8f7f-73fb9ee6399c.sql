
-- Create social_post_ideas table
CREATE TABLE public.social_post_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  topic TEXT NOT NULL,
  title_suggestion TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unused',
  post_id UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add title column to social_posts
ALTER TABLE public.social_posts ADD COLUMN title TEXT NOT NULL DEFAULT '';

-- Enable RLS on social_post_ideas
ALTER TABLE public.social_post_ideas ENABLE ROW LEVEL SECURITY;

-- Allow all access (matching existing pattern)
CREATE POLICY "Allow all access to social_post_ideas"
  ON public.social_post_ideas
  FOR ALL
  USING (true)
  WITH CHECK (true);
