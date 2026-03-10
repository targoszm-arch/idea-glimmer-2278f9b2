

## Plan: Add "Copy for Framer" Button to Article Page

### What
Add a button next to the "Edit" link on the Article preview page that copies the full article content (title, cover image, and HTML body) to the clipboard so it can be pasted into Framer manually.

### How

**File: `src/pages/Article.tsx`**

1. Import `Copy` and `Check` icons from lucide-react, and add a `copied` state.
2. Add a "Copy for Framer" button in the top action bar (next to Edit).
3. The copy handler will:
   - Build a rich HTML string containing the cover image (`<img>` tag) + the article HTML content
   - Use `navigator.clipboard.write()` with `text/html` MIME type so it pastes as formatted content (not raw HTML)
   - Also include plain text fallback (stripped of tags)
   - Show a toast confirmation and toggle the button icon to a checkmark briefly

This uses the Clipboard API's `ClipboardItem` to write rich HTML, which means when pasted into Framer (or any rich text target), the image and formatted text will carry over.

