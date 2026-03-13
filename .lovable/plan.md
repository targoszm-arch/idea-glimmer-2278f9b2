

## Plan: Auto-fetch Intercom author ID from API

### Problem
The current `sync-to-intercom` function requires `INTERCOM_AUTHOR_ID` as a secret, but the user doesn't have it and can only get it by calling the Intercom API.

### Solution
Update the edge function to automatically fetch the first admin's ID from the Intercom `GET /admins` endpoint using the API token, removing the need for the `INTERCOM_AUTHOR_ID` secret entirely.

### Changes

**Edit `supabase/functions/sync-to-intercom/index.ts`:**
- Remove the `INTERCOM_AUTHOR_ID` env check
- Before building the payload, call `GET https://api.intercom.io/admins` with the bearer token
- Extract the first admin's `id` from the response (`data.admins[0].id`)
- Cache/use that as `author_id` in the article payload
- Only `INTERCOM_API_TOKEN` secret is needed now

### No other files change
The UI already has the sync button wired up. This is a backend-only fix.

