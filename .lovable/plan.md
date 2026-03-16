

## Fix: White font color on FAQ headings in Framer

### Root Cause
When articles are generated or saved from the dark-themed editor, the HTML content can contain inline `style="color: ..."` attributes (either from the LLM output or TipTap serialization). Framer renders these literally, making headings invisible on light backgrounds.

### Changes

**1. `supabase/functions/generate-article/index.ts`** — Add explicit instruction to the prompt:
- "Do NOT include any inline `style` attributes on any HTML tags. Output clean, unstyled HTML only."

**2. `supabase/functions/framer-sync-articles/index.ts`** — Strip all inline `style` attributes from `content` before returning to Framer:
```js
content.replace(/\s*style="[^"]*"/gi, "")
```

**3. `supabase/functions/make-webhook/index.ts`** — Same sanitization on `body` and `faq` fields before returning.

**4. `src/pages/NewArticle.tsx`** and **`src/pages/EditArticle.tsx`** — Strip inline style attributes from content in the save handler (when calling `editor.getHTML()`) so the database always stores clean HTML:
```js
content.replace(/\s*style="[^"]*"/gi, "")
```

This ensures no inline color styles reach Framer regardless of source (LLM output, editor serialization, or manual editing).

