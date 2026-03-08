import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Please connect your Supabase project.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

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
  created_at: string;
  updated_at: string;
};

export type ContentIdea = {
  id: string;
  topic: string;
  title_suggestion: string;
  strategy: 'TOFU' | 'MOFU' | 'BOFU';
  category: string;
  status: 'unused' | 'used';
  created_at: string;
};
