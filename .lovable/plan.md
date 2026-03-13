

## Plan: Add Image & Video Embedding to Article Editor + Sync Updates

### What changes

**1. Add TipTap extensions for images and video**
- Install `@tiptap/extension-image` and `@tiptap/extension-youtube`
- Register both extensions in the editor config in `NewArticle.tsx` and `EditArticle.tsx`

**2. Add toolbar buttons in `EditorToolbar.tsx`**
- Add an "Insert Image" button that prompts for a URL and inserts an `<img>` node
- Add an "Insert Video" button that prompts for a YouTube URL and inserts an embedded iframe

**3. Sync functions — no structural changes needed**
- Both `make-webhook` (Framer) and `sync-to-intercom` already send `article.content` as the `body` field, which is full HTML
- Embedded `<img>` and `<iframe>` tags in the content will automatically flow through to Framer and Intercom
- The Intercom `description` field (excerpt) is already truncated to 255 chars and won't contain media

### Files to edit
| File | Change |
|------|--------|
| `src/pages/EditArticle.tsx` | Add Image + YouTube extensions to TipTap config |
| `src/pages/NewArticle.tsx` | Add Image + YouTube extensions to TipTap config |
| `src/components/EditorToolbar.tsx` | Add Image and Video insert buttons with URL prompts |

### New dependencies
- `@tiptap/extension-image`
- `@tiptap/extension-youtube`

