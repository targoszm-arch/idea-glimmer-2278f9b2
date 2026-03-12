## Plan: Move Action Buttons to Top of Page

### What

Move the "Save Draft", "Publish", and "AI Assistant" buttons from below the editor (lines 339-365) to the top of the page, grouped next to the back button in an evenly-spaced horizontal stack.

### Changes (`src/pages/NewArticle.tsx`)

1. **Replace the back button area (lines 231-234)** with a flex row containing the back button on the left and the three action buttons on the right, using `flex items-center justify-between` for layout and `gap-3` for button spacing.
2. **Remove the bottom button bar (lines 339-365)** — the `<div className="mt-4 flex items-center gap-3">` block with Save Draft, Publish, and AI Assistant.

The top bar will look like:

```text
[ ← Back to Library ]                    [ Save Draft ] [ Publish ] [ AI Assistant ]
```

All button styles remain the same. No other files change.  
  
Remove the disclaimers from articles to never generate them