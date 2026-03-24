
## Restore the preview by fixing the current build blockers

The blank page is coming from compile-time breakages, not a runtime/data issue. I inspected the reported files and there are 4 direct fixes plus 1 extra JSX cleanup in `Header.tsx`.

### Implementation plan

1. **Fix `src/components/Header.tsx`**
   - Remove the duplicate `useState` import.
   - Repair the component return so the fragment correctly wraps both `<UpgradeModal />` and `<header>...</header>`.
   - Leave the branding as `ContentLab` (do not remove it).

2. **Fix `src/components/OutOfCreditsDialog.tsx`**
   - Replace the invalid `STRIPE_URLS.topUp200` reference.
   - Align both button URLs with the labels already shown in the UI:
     - `100 Credits / €25` → `STRIPE_URLS.topUp25`
     - `200 Credits / €50` → `STRIPE_URLS.topUp50`

3. **Fix `src/pages/NewArticle.tsx`**
   - Remove the stray `UpgradeModal` render that references undefined `showUpgrade` / `setShowUpgrade`.
   - Remove the unused `useUpgrade` and `UpgradeModal` imports.
   - Keep the existing `OutOfCreditsDialog` flow, since it is already wired and working for credit checks.

4. **Fix `src/pages/Profile.tsx`**
   - Resolve the `plan` redeclaration by using a single source of truth in this file.
   - Safest minimal change: keep local `plan` state for `fetchPlan()` / `planStarted`, and change the hook destructure to only read `credits`.

### Why this should restore the preview
These errors are enough to stop the app from compiling:
- duplicate identifier in `Header.tsx`
- invalid Stripe property in `OutOfCreditsDialog.tsx`
- undefined variables in `NewArticle.tsx`
- duplicate `plan` declaration in `Profile.tsx`

There is also a malformed JSX return in `Header.tsx` that should be corrected while fixing the import issue, otherwise the file remains unstable.

### Technical details
```text
Header.tsx
- duplicate import: useState
- malformed fragment / return structure

OutOfCreditsDialog.tsx
- uses STRIPE_URLS.topUp200, but only topUp25/topUp50/topUp100 exist

NewArticle.tsx
- renders UpgradeModal with showUpgrade/setShowUpgrade that are never declared
- already has OutOfCreditsDialog + showCreditsDialog, so the extra modal is redundant

Profile.tsx
- both `const { credits, plan } = useCredits()` and `const [plan, setPlan] = useState("free")`
- this causes the block-scoped redeclaration error
```

### Expected result
After these file-level fixes, the project should compile again and the preview should load normally with the `ContentLab` name preserved.
