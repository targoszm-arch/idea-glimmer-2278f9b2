export const API_BASE = "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1";
export const APP_URL  = "https://www.app.content-lab.ie";
const KEY_STORAGE = "contentlab_api_key";

export async function getStoredApiKey(): Promise<string | null> {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}
export function saveStoredApiKey(k: string) {
  try { localStorage.setItem(KEY_STORAGE, k); } catch {}
}
export function clearStoredApiKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  content: string;
  cover_image_url: string | null;
  created_at: string;
  reading_time_minutes: number | null;
  author_name: string | null;
  meta_description: string;
}

export async function fetchArticles(apiKey: string): Promise<Article[]> {
  const res = await fetch(`${API_BASE}/framer-sync-articles`, {
    headers: { Authorization: "Bearer " + apiKey },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const { articles } = await res.json();
  return articles ?? [];
}
