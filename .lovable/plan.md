## Fix: Intercom rejects `.webp` images in article body

### Problem

Intercom's API cannot ingest `.webp` images embedded in article HTML. When the `body` contains `<img>` tags pointing to `.webp` files in Supabase Storage, the API returns an error.

### Approach

Strip or replace image references in the HTML body before sending to Intercom. Two options:

1. **Strip all `<img>` tags** from the body before sending — simplest, avoids the issue entirely

I recommend **option 1** (strip images) since Intercom help center articles typically focus on text content, and cover images can be handled separately via Intercom's own image upload if needed.

### Changes

`**supabase/functions/sync-to-intercom/index.ts**`

Add a sanitizer function that removes `<img>` tags with `.webp` sources (or all `<img>` tags if you prefer clean text-only articles):

```ts
function sanitizeHtmlForIntercom(html: string): string {
  // Remove img tags with .webp sources that Intercom can't ingest
  return html.replace(/<img[^>]+src="[^"]*\.webp"[^>]*\/?>/gi, '');
}
```

Apply it to the `body` field in the payload:

```ts
body: sanitizeHtmlForIntercom(article.content || ""),
```

This is a single-file change to the edge function, which will auto-deploy.