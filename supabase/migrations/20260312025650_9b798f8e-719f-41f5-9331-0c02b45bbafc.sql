ALTER TABLE public.articles
  ADD COLUMN author_name text NOT NULL DEFAULT '',
  ADD COLUMN reading_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN faq_html text NOT NULL DEFAULT '';