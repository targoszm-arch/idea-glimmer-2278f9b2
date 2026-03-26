

## Problem

There are 9 build errors across edge functions and the frontend preventing the app from loading:

1. **`cleanContentForPublish` not defined** in 3 edge functions (`publish-to-framer`, `sync-to-notion`, `wordpress-publish`) — the function is called but never declared or imported
2. **`createClient` not imported** in `framer-probe/index.ts` — used on line 22 but no import statement
3. **`WebSocket.prototype` read-only assignment** in 3 files (`delete-from-framer`, `publish-to-framer`, `reconcile-framer`) — `globalThis.WebSocket.prototype = ...` is not allowed in Deno
4. **`postMessage` not on WebSocket** in `publish-to-framer` — Deno's WebSocket type doesn't have `postMessage`
5. **`canva_design_token` not in types** in `SocialMedia.tsx` — the column exists in the database but not in the generated Supabase types

## Plan

### Step 1 — Add `cleanContentForPublish` to shared module

Add a `cleanContentForPublish` function to `supabase/functions/_shared/auth.ts` (or a new `_shared/content.ts`). This function strips unnecessary HTML artifacts before publishing. Then import it in the 3 affected files.

### Step 2 — Add missing `createClient` import to `framer-probe`

Add `import { createClient } from "https://esm.sh/@supabase/supabase-js@2";` at the top of `framer-probe/index.ts`.

### Step 3 — Fix WebSocket prototype assignments

In `delete-from-framer`, `publish-to-framer`, and `reconcile-framer`, replace:
```typescript
globalThis.WebSocket.prototype = OrigWS.prototype;
```
with:
```typescript
Object.defineProperty(globalThis.WebSocket, 'prototype', { value: OrigWS.prototype });
```

### Step 4 — Fix `postMessage` type error in `publish-to-framer`

Cast through `any` to avoid the type error on the WebSocket prototype:
```typescript
if (!(OrigProto as any).postMessage) {
  (OrigProto as any).postMessage = function(data: unknown) { ... };
}
```

### Step 5 — Add `canva_design_token` column migration

Create a database migration to add the `canva_design_token` column to `social_post_ideas` if it doesn't exist. This will regenerate the Supabase types and fix the SocialMedia.tsx errors.

Alternatively, cast the update calls with `as any` to unblock the build immediately.

### Technical details

- 6 edge function files need edits
- 1 migration or type workaround for SocialMedia.tsx
- The `cleanContentForPublish` function should strip `<style>` tags, editor artifacts, and normalize whitespace — a simple implementation that covers the common cases

