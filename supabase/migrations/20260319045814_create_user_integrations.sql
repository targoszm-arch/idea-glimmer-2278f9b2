-- User integrations table: stores OAuth tokens per user per platform
CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL, -- 'notion' | 'shopify' | 'intercom' | 'google'
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  platform_user_id text,   -- e.g. Notion workspace ID, Shopify shop ID
  platform_user_name text, -- e.g. "My Workspace", "mystore.myshopify.com"
  metadata jsonb DEFAULT '{}'::jsonb, -- extra platform-specific data
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- RLS: users can only see their own integrations
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON user_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast user lookups
CREATE INDEX user_integrations_user_id_idx ON user_integrations(user_id);
CREATE INDEX user_integrations_platform_idx ON user_integrations(user_id, platform);
