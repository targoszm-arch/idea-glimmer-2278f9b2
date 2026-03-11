

## Plan: Fix Instagram Reel Generation Failures

### Root Cause
The recent security fix added JWT authentication (`getClaims()`) to all edge functions, but the app has no user authentication. Two issues:

1. **`generate-reel-video` edge function**: The `callReelFunction` in `SocialMedia.tsx` (line 178) sends the **anon key** as the Bearer token. The edge function's `getClaims()` check rejects this because the anon key is not a user JWT, returning 401 Unauthorized.

2. **`generate-social-post` edge function**: Called via `streamAI()` which also falls back to the anon key when no session exists. Same 401 failure.

Since there is no authentication system in this app, the `getClaims()` validation blocks all requests.

### Fix

**Option A (recommended):** Remove the `getClaims()` auth check from both edge functions since the app has no auth. The functions already have `verify_jwt = false` in `config.toml`. This restores the pre-security-fix behavior.

Additionally, the `callReelFunction` should use the same token-fetching logic as `streamAI` (attempt session token first, fall back to anon key) for consistency.

### Files to modify

1. **`supabase/functions/generate-reel-video/index.ts`** (lines 13-28) -- Remove `getClaims()` auth block
2. **`supabase/functions/generate-social-post/index.ts`** (lines 152-166) -- Remove `getClaims()` auth block
3. **`supabase/functions/generate-social-ideas/index.ts`** -- Remove `getClaims()` auth block (used for idea generation)
4. **`supabase/functions/heygen/index.ts`** -- Remove `getClaims()` auth block (used for HeyGen video generation)
5. **All other edge functions** that had `getClaims()` added -- Remove the check since there is no auth system

This removes the auth gates from all 12 edge functions that were updated in the security fix. Once user authentication is added to the app in the future, these checks should be re-enabled.

