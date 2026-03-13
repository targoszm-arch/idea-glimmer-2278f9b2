

## Plan: Add Table Support to TipTap Editor

### Problem
Pasting tabular content into the editor loses formatting because TipTap's `StarterKit` does not include table support. TipTap requires dedicated table extensions to parse and render `<table>` HTML.

### Solution
Install and register the TipTap table extensions, and add basic table CSS styles.

### Changes

| File | Change |
|------|--------|
| `src/pages/NewArticle.tsx` | Import and register `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` |
| `src/pages/EditArticle.tsx` | Same as above |
| `src/index.css` | Add `.tiptap table` styles (borders, padding, collapse) |

### New dependencies
- `@tiptap/extension-table`
- `@tiptap/extension-table-row`
- `@tiptap/extension-table-cell`
- `@tiptap/extension-table-header`

### CSS additions
```css
.tiptap table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.tiptap th, .tiptap td { border: 1px solid hsl(var(--border)); padding: 0.5rem 0.75rem; text-align: left; }
.tiptap th { background: hsl(var(--muted)); font-weight: 600; }
```

### Sync compatibility
Tables render as standard `<table>` HTML — fully compatible with both Intercom and Framer syncs which already transmit raw HTML content.

