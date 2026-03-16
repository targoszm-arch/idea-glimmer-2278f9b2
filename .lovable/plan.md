

## Make editor toolbar sticky across all editor screens

### Problem
The `EditorToolbar` component is not sticky — when scrolling long articles, the toolbar scrolls out of view. The editor layout (cover image, title, toolbar + editor, AI assistant sidebar) is also duplicated between `NewArticle.tsx` and `EditArticle.tsx`.

### Changes

**1. Make `EditorToolbar` sticky** (`src/components/EditorToolbar.tsx`)

Add `sticky top-0 z-20 bg-card` classes to the toolbar's root wrapper so it pins to the top of the editor card when scrolling. This is the simplest fix and works in both pages without needing a shared layout component — the toolbar is already shared.

**2. Ensure the editor card container allows sticky behavior** (`EditArticle.tsx` and `NewArticle.tsx`)

The toolbar lives inside a `rounded-xl border border-border bg-card` div. For `sticky` to work, the parent must not have `overflow-hidden`. Both pages currently use `overflow-hidden` on the editor container — this will be removed (or changed to only apply to the bottom via `rounded-b-xl overflow-hidden` on the `EditorContent` wrapper instead).

### Specific file changes

- **`src/components/EditorToolbar.tsx`**: Add `sticky top-0 z-20 bg-card border-b border-border rounded-t-xl` to the toolbar's root element
- **`src/pages/EditArticle.tsx`** (line 473): Remove `overflow-hidden` from the editor card wrapper div, keep it only on `EditorContent`
- **`src/pages/NewArticle.tsx`** (line 442): Same — remove `overflow-hidden` from the editor card wrapper, it's already on the `EditorContent` wrapper

This keeps the toolbar as the single shared component (no new component needed) and ensures it's sticky in every editor that uses it.

