// Re-export supabase client from integrations
export { supabase } from '@/integrations/supabase/client';

export type Article = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_description: string;
  category: string;
  status: 'draft' | 'published';
  cover_image_url: string | null;
  framer_item_id?: string | null;
  intercom_article_id?: string | null;
  author_name: string;
  reading_time_minutes: number;
  faq_html: string;
  created_at: string;
  updated_at: string;
};

export type ContentIdea = {
  id: string;
  topic: string;
  title_suggestion: string;
  description: string;
  strategy: 'TOFU' | 'MOFU' | 'BOFU';
  category: string;
  status: 'unused' | 'used';
  scheduled_for: string | null;
  article_id: string | null;
  created_at: string;
};
