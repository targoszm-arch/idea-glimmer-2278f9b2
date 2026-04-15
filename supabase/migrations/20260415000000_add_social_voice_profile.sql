-- Add social voice profile to ai_settings so users can describe their
-- personal tone, cadence, and vocabulary for social post generation.
-- The field stores a free-text description (e.g. pasted example posts,
-- written voice notes) that is injected into the generate-social-post
-- edge function as the `author_voice` input.
ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS social_voice_profile text NOT NULL DEFAULT '';
