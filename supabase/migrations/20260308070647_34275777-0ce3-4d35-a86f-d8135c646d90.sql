ALTER TABLE public.content_ideas 
ADD COLUMN description text NOT NULL DEFAULT '',
ADD COLUMN scheduled_for date DEFAULT NULL;