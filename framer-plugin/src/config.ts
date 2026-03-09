// ── Supabase endpoint that serves published articles ──
// This calls the framer-sync-articles edge function
export const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuc2hvYnZwcWVndHRycGFvd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzc0MzAsImV4cCI6MjA4ODUxMzQzMH0.EA4gEzrhDTGp4Ga7TOuAEPfPtWFSOLqEEpVTNONCVuo";

export const SYNC_ENDPOINT = `${SUPABASE_URL}/functions/v1/framer-sync-articles`;
