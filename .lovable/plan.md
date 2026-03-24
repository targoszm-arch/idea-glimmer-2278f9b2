
Problem identified

I checked the actual code and runtime state, and the issue is not that Framer failed to connect.

What I verified
- Your user already has a `user_integrations` row for `platform = 'framer'`.
- It was created by the plugin and stores:
  - `access_token = 'plugin-managed'`
  - `metadata.collection_id = 'DtaTYPjkD'`
  - `platform_user_name / project_name = 'Skill Studio AI'`

So the plugin did register successfully. “Not connected” is the wrong conclusion.

Actual root cause

There are 2 different Framer flows in the code, and they are inconsistent:

1. Framer plugin sync path
- `framer-plugin/src/App.tsx` saves your ContentLab API key and can load article counts with it.
- But `framer-plugin/src/sync.ts` ignores that saved key and calls `framer-sync-articles` with the Supabase anon key instead.
- That breaks Framer’s native CMS “Sync” flow, because `framer-sync-articles` needs either:
  - your ContentLab API key (`cl_...`), or
  - a real logged-in user JWT.
- Result: the collection exists, but the actual sync path cannot fetch your user’s articles.

2. ContentLab app “Publish to Framer” path
- `src/pages/EditArticle.tsx` and `src/pages/Dashboard.tsx` still call `publish-to-framer`.
- `publish-to-framer` is a server-side Framer API push function that expects Framer project credentials (`project_url` + API token).
- Plugin-managed connections do not have those credentials, by design.
- So the app shows a misleading “Framer is not connected” error even though the plugin connection exists.

In short:
- You are connected via plugin.
- Plugin sync is broken because the saved ContentLab API key is not used in `sync.ts`.
- The app-side “Publish to Framer” button is calling the wrong backend flow for plugin-managed accounts.

Implementation plan

1. Fix the plugin sync mode to use the saved ContentLab API key
- Update `framer-plugin/src/sync.ts` to read the same plugin data key saved in `App.tsx`.
- Pass that saved `cl_...` key into article fetching instead of `SUPABASE_ANON_KEY`.
- Fail loudly with a clear plugin error if the saved key is missing/invalid.

2. Unify plugin key handling
- Move the plugin storage key into one shared constant so `App.tsx` and `sync.ts` cannot drift.
- Make `syncExistingCollection()` use the same credential source as manual “Sync from ContentLab”.

3. Stop treating plugin-managed users as “not connected”
- Update `publish-to-framer` logic so plugin-managed integrations are not interpreted as disconnected.
- It should return a specific plugin-mode response instead of the current fake “not connected” error.

4. Remove the wrong Framer action from the web app for plugin-managed setups
- In `src/pages/EditArticle.tsx`, do not call `publish-to-framer` when the Framer integration is `plugin-managed`.
- In `src/pages/Dashboard.tsx`, do not bulk-call `publish-to-framer` for plugin-managed users.
- Replace that action with plugin-appropriate UI, for example:
  - “Sync in Framer”
  - or disabled state with explanatory text
- This prevents the app from sending users into a broken server-side push flow that does not apply to plugin installations.

5. Tighten the plugin registration flow
- In `framer-plugin/src/App.tsx`, check the `register-framer-plugin` response instead of ignoring it.
- If registration fails, show the user a visible error instead of silently continuing.
- This is not the main bug here, but it prevents future false-positive “connected” states.

Technical details / files to update

- `framer-plugin/src/App.tsx`
  - share key constant
  - handle register response properly

- `framer-plugin/src/sync.ts`
  - read saved plugin API key
  - use that key for `framer-sync-articles`
  - show clear error when unavailable

- `framer-plugin/src/main.tsx`
  - keep background sync flow, but make sure it uses the corrected key-aware sync function

- `src/pages/EditArticle.tsx`
  - detect plugin-managed Framer integration
  - stop calling `publish-to-framer` for that mode

- `src/pages/Dashboard.tsx`
  - same as above for bulk sync

- `supabase/functions/publish-to-framer/index.ts`
  - stop returning the misleading “Framer is not connected” message for plugin-managed accounts
  - return a plugin-mode-specific response if this endpoint is hit by mistake

Expected result after fix

- Installing the plugin + entering the ContentLab API key is enough.
- Framer’s actual CMS sync will pull the correct user’s published articles.
- The collection will stay connected and sync correctly.
- The ContentLab web app will stop showing a false “not connected” error for plugin-managed Framer users.
- No empty Framer credential boxes, and no fake fallback behavior.

Validation checklist

- Confirm Framer integration still appears connected in `user_integrations`
- In Framer, run the native CMS sync and verify articles appear/update
- Verify `api_keys.last_used_at` updates when sync runs with the saved `cl_...` key
- Verify Edit Article / Dashboard no longer call the wrong server-side Framer push flow for plugin-managed users
- Verify plugin registration errors are surfaced instead of silently ignored
