
Goal: Make the editor toolbar truly sticky while scrolling long articles, and keep all toolbar actions working.

What I found
- The toolbar has `sticky top-0`, but it sits inside a parent container with `overflow-hidden` in both editor pages:
  - `src/pages/EditArticle.tsx`
  - `src/pages/NewArticle.tsx`
- `overflow-hidden` on an ancestor commonly prevents sticky behavior from following page scroll.
- Header is already non-sticky, so it is not the blocker now.

Implementation plan
1. Fix sticky context in both editor pages
- Update the editor shell container in:
  - `src/pages/EditArticle.tsx`
  - `src/pages/NewArticle.tsx`
- Remove `overflow-hidden` from the outer editor wrapper (`rounded-xl border bg-card` should remain).
- Keep clipping/rounding only where needed (content area), not on the sticky ancestor.

2. Preserve visual design after removing overflow
- Add an inner wrapper around `EditorContent` with bottom rounding/clipping (e.g., `rounded-b-xl overflow-hidden`) so content still looks clean.
- Keep toolbar at top of card with matching top radius.

3. Harden toolbar stickiness
- In `src/components/EditorToolbar.tsx`, keep sticky classes and increase priority for layering/readability:
  - `sticky top-0 z-40` (or higher than local content)
  - solid-ish background + subtle shadow so text remains readable while scrolling.
- Keep interactions unchanged (same button handlers and disabled states).

4. Validate on both editor routes
- Test `/edit/:id` with a long article:
  - Scroll from top to near bottom, confirm toolbar stays visible.
  - Click every toolbar control while scrolled down (bold/italic/headings/lists/link/image/video/infographic/undo/redo).
- Test `/new` with generated long content for parity.
- Quick responsive check at desktop and mobile width to confirm no overlap/regression.

Technical details
- Files to update:
  - `src/pages/EditArticle.tsx`
  - `src/pages/NewArticle.tsx`
  - `src/components/EditorToolbar.tsx`
- Root cause is layout/overflow, not editor command logic.
- This keeps the current editing architecture intact and avoids changing save/generate/sync behavior.
