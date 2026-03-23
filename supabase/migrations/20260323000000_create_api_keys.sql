-- API keys table for ContentLab Framer plugin
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE DEFAULT 'cl_' || replace(gen_random_uuid()::text, '-', ''),
  name text NOT NULL DEFAULT 'ContentLab Plugin Key',
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own api keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
