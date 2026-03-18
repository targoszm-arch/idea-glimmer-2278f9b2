

## Update article generation structure with new format requirements

### What changes
The system prompt in `supabase/functions/generate-article/index.ts` will be updated to enforce the new article structure across all article types.

### New required sections (in order)

1. **TL;DR at the very top** — A 1-2 sentence summary immediately after the `<h1>`, followed by a bulleted breakdown of what the article covers
2. **Table of Contents** — An HTML `<nav>` with anchor links to each major section (H2s)
3. **Short summary paragraph** — 2-3 sentences framing the article's purpose and audience
4. **Main body sections** — Using the existing type-detection logic (comparison, how-to, thought leadership, etc.) but with these additional rules applied to every section:
   - **Answer-first structure**: Lead every section with a 1-sentence direct answer, then elaborate
   - **Question-based H2/H3 headings**: e.g. "What is the best LMS for compliance?" not "Our LMS Features"
   - **HTML comparison tables** using `<table>` tags (already enforced, will reinforce)
   - **Quantified proof points**: Specific numbers, not vague claims
   - **Third-party validation**: G2 reviews, analyst quotes, named case studies
5. **FAQ section** — 8-10 Q&A pairs (increased from 8)
6. **JSON-LD structured data** — `FAQPage` and `SoftwareApplication` schema in `<script type="application/ld+json">` blocks appended after the article HTML

### Files to modify

1. **`supabase/functions/generate-article/index.ts`** — Rewrite the OUTPUT FORMAT and STYLE sections of the system prompt to enforce all the new structural requirements (TL;DR, ToC, answer-first headings, JSON-LD, proof points, third-party validation)

### What stays the same
- Article type detection logic (comparison, how-to, thought leadership, product deep dive)
- Comparison article template structure (enhanced with new rules)
- Auth, streaming, error handling — untouched
- FAQ `<h3>` requirement and sanitization pipeline — untouched

