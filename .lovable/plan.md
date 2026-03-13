

## Plan: Add Infographics Generation (AI Image + HTML Components)

### Overview
Two complementary infographic capabilities:
1. **AI-generated infographic images** — A new edge function that uses DALL-E to generate infographic-style images from a text prompt, uploaded to storage and inserted into the editor
2. **HTML infographic components** — Toolbar buttons to insert pre-styled HTML templates (stat cards, comparison grids, timelines, process flows) directly into article content

Both produce standard HTML/images, fully compatible with Intercom and Framer sync.

### Changes

**1. New Edge Function: `supabase/functions/generate-infographic/index.ts`**
- Accepts a `prompt` and `style` (e.g. "comparison", "stats", "process flow", "timeline")
- Calls DALL-E with an infographic-optimized prompt (clean, minimal, data-visualization style — not photorealistic like cover images)
- Uploads result to `article-covers` bucket, returns public URL
- Register in `supabase/config.toml`

**2. Update `src/components/EditorToolbar.tsx`**
- Add an "Infographic" dropdown/popover with two sections:
  - **Generate AI Infographic**: text input for description + generate button → calls the new edge function → inserts `<img>` into editor
  - **Insert HTML Template**: buttons for predefined templates (Stat Cards, Comparison Grid, Timeline, Process Flow) → inserts editable HTML blocks into editor

**3. Add `src/lib/infographic-templates.ts`**
- Export functions that return styled HTML strings for each template type:
  - `statCardsTemplate(items)` — grid of stat/metric cards with icons
  - `comparisonGridTemplate(items)` — side-by-side comparison boxes
  - `timelineTemplate(items)` — vertical timeline with numbered steps
  - `processFlowTemplate(items)` — horizontal process arrows
- All templates use inline styles for cross-platform rendering in Intercom/Framer

**4. Add `src/components/InfographicDialog.tsx`**
- Modal dialog with two tabs: "AI Generate" and "HTML Template"
- AI tab: text input + style selector + generate button with loading state
- Template tab: template type selector + dynamic form to fill in items (title, value, description per item) + preview + insert button

**5. Update `src/index.css`**
- Add base styles for `.infographic-*` classes used in templates (with inline style fallbacks for sync compatibility)

### Files

| File | Action |
|------|--------|
| `supabase/functions/generate-infographic/index.ts` | Create — DALL-E infographic generation |
| `supabase/config.toml` | Edit — register new function |
| `src/lib/infographic-templates.ts` | Create — HTML template generators |
| `src/components/InfographicDialog.tsx` | Create — modal UI for both approaches |
| `src/components/EditorToolbar.tsx` | Edit — add infographic button that opens dialog |
| `src/index.css` | Edit — infographic preview styles |

### Sync Compatibility
- AI-generated infographics are `<img>` tags with public URLs — works everywhere
- HTML templates use inline styles — renders correctly in Intercom articles and Framer without external CSS dependencies

