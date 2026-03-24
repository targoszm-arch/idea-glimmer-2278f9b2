

## Fix: Blank Preview

After thorough code review, all source files (Header.tsx, Landing.tsx, App.tsx, types.ts) are syntactically correct with no visible errors. The blank page with zero console logs and zero network requests indicates the Vite dev server build is stalled or failed silently.

### Diagnosis
- No TypeScript errors found in imports or component code
- Logo asset exists at `src/assets/ContentLab_Logo.png`
- All imports resolve correctly
- The `__InternalSupabase` block in `types.ts` (added in a previous edit) may be causing a build-time type error that prevents compilation

### Plan

1. **Remove the non-standard `__InternalSupabase` property** from `src/integrations/supabase/types.ts` (lines 11-14) — this was added in a previous migration sync and may cause the Supabase client instantiation to fail at the type level, blocking the build.

2. **If that alone doesn't fix it**, trigger a clean rebuild by adding a trivial comment to `src/main.tsx` to force Vite to re-process the entry point.

### Technical Details
The `__InternalSupabase: { PostgrestVersion: "14.1" }` key in the `Database` type is a newer Supabase CLI convention. If the installed `@supabase/supabase-js` version doesn't expect it, the `createClient<Database>()` call in `client.ts` will produce a type error that may block the build. Removing it restores compatibility.

