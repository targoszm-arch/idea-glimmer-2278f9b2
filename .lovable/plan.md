

## Fix 4 editor and generation bugs

### Bug 1: H1/H3 toolbar buttons not showing selected state

The `EditorToolbar` receives the `editor` instance as a prop but doesn't subscribe to editor state changes. TipTap only triggers re-renders in the component that calls `useEditor()`. The toolbar needs to force re-renders on editor transactions.

**Fix**: Import `useEditorState` from `@tiptap/react` in `EditorToolbar.tsx` to subscribe to editor updates, ensuring `editor.isActive()` is re-evaluated on every selection/content change. Also explicitly configure `StarterKit` with `heading: { levels: [1, 2, 3] }` in both `EditArticle.tsx` and `NewArticle.tsx` for clarity.

### Bug 2: FAQ questions use `<strong>` instead of `<h3>` — Framer can't display them

The system prompt in `generate-article/index.ts` line 314 specifies FAQ format as:
```
<div class="faq-item"><h3>Question</h3><p>Answer</p></div>
```
But the LLM sometimes outputs `<h5>` (line 217 references `<h5>`) or bold text instead.

**Fix**: Strengthen the FAQ instruction in the system prompt to explicitly say: "FAQ questions MUST use `<h3>` tags, NOT `<strong>`, `<b>`, `<h5>`, or any other tag."

### Bug 3: Raw "html" text appearing in article body

The LLM sometimes outputs the literal word "html" (from markdown code fence ` ```html `) at the start of the response.

**Fix**: Add a sanitization step in the `onDone` cleanup in both `NewArticle.tsx` and `ContentIdeas.tsx` to strip ` ```html ` and ` ``` ` markers, as well as any standalone "html" text at the start of the content.

### Bug 4: Citation brackets `[1]`, `[2]` appearing in generated text

Despite the prompt saying "NEVER use citation brackets", the LLM still includes them.

**Fix**: Add a regex cleanup in the `onDone` handler in both `NewArticle.tsx` and `ContentIdeas.tsx`:
```js
.replace(/\[\d+\]/g, "")
```
This strips all `[1]`, `[2]`, etc. from the final content regardless of what the LLM outputs.

### Files to modify

1. **`src/components/EditorToolbar.tsx`** — Add `useEditorState` hook to subscribe to editor transaction updates
2. **`src/pages/NewArticle.tsx`** — Configure StarterKit heading levels; add citation bracket and "html" text stripping in `onDone`
3. **`src/pages/EditArticle.tsx`** — Configure StarterKit heading levels
4. **`src/pages/ContentIdeas.tsx`** — Add citation bracket and "html" text stripping in `onDone`
5. **`supabase/functions/generate-article/index.ts`** — Strengthen FAQ `<h3>` instruction and reinforce no-citations rule

