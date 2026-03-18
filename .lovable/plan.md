

## Update generate-article prompt: refined AEO structure + BlogPosting schema

### Changes to `supabase/functions/generate-article/index.ts`

The system prompt (lines 46–356) will be updated with these specific changes:

**1. Split TL;DR into two parts (Section A)**
- Top-level TL;DR: 1-2 sentence summary line immediately after `<h1>`
- Expanded TL;DR section: `<h2>TL;DR: [topic]</h2>` with 6-10 bulleted takeaways with bold labels

**2. FAQ count changed from 8-10 to 5-10** (Sections E, output format, and comparison template references)

**3. SoftwareApplication schema updated** (Section F, line ~155-161)
- Description → `"AI-native LMS for compliance and corporate training. Creates multilingual, audit-ready courses from policy documents in minutes."`
- Currency → `EUR` (was `USD`)
- Add `"url": "https://www.skillstudio.ai"`

**4. BlogPosting JSON-LD added** (Section F, after SoftwareApplication)
- Third `<script type="application/ld+json">` block
- Instruct the AI to populate all fields from the article it is generating — NOT output literal `{{placeholder}}` tokens
- Fields: headline (from `<h1>`), description (from META_DESCRIPTION), url (constructed from slug), datePublished (today's date), author (use "Skill Studio AI" as default), articleSection (from category)
- Publisher hardcoded as `"Skill Studio AI"`

**5. Stricter AEO content rules added** (Style section, ~line 274)
- Explicit ban on vague language: "many companies," "significant results," "various options" must be replaced with named examples and specific figures
- Every section must include at least one quantified proof point (reinforce existing rule)

**6. FAQ answer length constraint** — answers must be 2-4 sentences

All other logic (auth, streaming, error handling, sanitization, article type detection) remains untouched.

