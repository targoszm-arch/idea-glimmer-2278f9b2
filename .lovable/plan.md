

## Problem

Two issues need fixing:

1. **Build error**: `supabase/functions/run-automations/index.ts` has an unterminated regexp literal at line 212. The regex for matching Markdown tables uses literal newlines (`\n` as actual line breaks) inside a regex pattern, which Deno's parser rejects.

2. **Broken reset password link**: The password reset email redirects to `https://contentlab.skillstudio.ai` — this appears to be a stale/incorrect Supabase Site URL configuration. The Supabase project's **Site URL** and **Redirect URLs** need to be updated in the Supabase dashboard to point to the correct domain (`content-lab.ie` or the Lovable preview URL).

   The link in the error also shows `type=signup`, suggesting this is actually a signup confirmation link, not a password reset — but the root cause is the same: the redirect URL is wrong.

## Plan

### Step 1 — Fix the unterminated regexp in `run-automations/index.ts`

Replace the multi-line regex literal (lines 212-215) with a `new RegExp()` constructor that uses `\\n` string escapes instead of actual newlines:

```typescript
.replace(new RegExp("(\\|.+\\|\n)([\\|\\-: ]+\\|\n)((?:\\|.+\\|\n)*)", "gm"), (match) => {
```

This produces the same regex pattern but avoids the parser error.

### Step 2 — Fix the redirect URL for password reset and signup

The redirect URLs in the code use `window.location.origin`, which is correct at runtime. However, the **Supabase Auth Site URL** setting must be updated in the Supabase dashboard:

- Go to **Supabase Dashboard → Authentication → URL Configuration**
- Set **Site URL** to `https://content-lab.ie` (or your production domain)
- Add `https://content-lab.ie/reset-password` and `https://content-lab.ie/signup/confirm` to the **Redirect URLs** allowlist
- Remove any stale `contentlab.skillstudio.ai` entries

This is a dashboard-only change — no code modification needed for the redirect issue.

### Technical details

- The regexp fix is a single-line change in the edge function
- The Supabase URL Configuration change requires manual action in the dashboard at: `https://supabase.com/dashboard/project/rnshobvpqegttrpaowxe/auth/url-configuration`

