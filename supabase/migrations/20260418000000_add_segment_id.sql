-- Allow targeting Resend segments (subsets of an audience) in addition
-- to full audiences. When both audience_id and segment_id are present,
-- the send function uses Resend's Broadcasts API with segment filtering.

alter table public.newsletter_schedules
  add column if not exists resend_segment_id text;
