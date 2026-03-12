

## Plan: Extend Article Generation with SEO Meta Description and FAQ Section

### What
Enhance the article generation flow to also produce a proper SEO meta description and 8 FAQ questions and answers, all generated in a single AI call. The FAQs will be stored as part of the article content and displayed with an accordion UI.

### Changes

**1. Update Edge Function Prompt** (`supabase/functions/generate-article/index.ts`)
- Extend the system prompt to instruct the AI to generate:
  - A compelling SEO meta description (already partially there, but reinforce it)
  - 8 FAQ questions and answers based on the article content and AI knowledge base context
- The FAQs should be output as a structured HTML section at the end of the article body using `<h2>Frequently Asked Questions</h2>` followed by FAQ items wrapped in a specific HTML pattern (e.g., `<div class="faq-item"><h3>Q: ...</h3><p>A: ...</p></div>`)
- Keep the existing `<!-- META_TITLE -->` and `<!-- META_DESCRIPTION -->` comment pattern

**2. Update Article Display** (`src/pages/Article.tsx`)
- The FAQ HTML is already part of `article.content`, so it renders automatically via `dangerouslySetInnerHTML`
- Add accordion-style CSS or use the existing Radix accordion component to style `.faq-item` sections for a polished, collapsible FAQ experience

**3. Update Edit Article Page** (`src/pages/EditArticle.tsx`)
- No structural changes needed — FAQs live inside the content HTML and are editable via the existing rich text editor

**4. Update Framer Sync** (optional enhancement)
- The FAQ section is already part of `content`, so it syncs to Framer automatically

### Technical Details

- **No database migration needed** — FAQs are embedded in the `content` column as HTML
- **Single AI call** — the prompt already generates the full article; we extend it to also produce the FAQ section inline
- **Edge function redeployment required** after updating the prompt
- The meta description generation is already in place but will be reinforced in the prompt for better quality

