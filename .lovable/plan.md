

## Social Media Post Generator Module

### Overview
Add a new "Social Media" page with subtabs for five generators: LinkedIn, YouTube, Twitter, Instagram Carousel, and Instagram Reel. Each generator uses the existing Perplexity AI pipeline (via a new edge function) and AI Settings context to produce platform-specific content.

### What will be built

**1. New page: `src/pages/SocialMedia.tsx`**
- Uses the existing `Header`/`Footer` layout pattern
- Tab navigation with 5 subtabs: LinkedIn | YouTube | Twitter | Instagram Carousel | Instagram Reel
- Each tab has:
  - A topic/prompt input field
  - A "Generate" button that calls the new edge function
  - A streaming output area showing the generated content
  - A copy-to-clipboard button on the result

**Platform-specific outputs:**
- **LinkedIn**: Professional post with hook, body, hashtags, CTA
- **YouTube**: Title, description, tags, script outline, thumbnail concept
- **Twitter**: Thread of tweets (280 char each), hashtags
- **Instagram Carousel**: Slide-by-slide content (slide title + text + image prompt for each slide, typically 5-10 slides)
- **Instagram Reel**: Script with hook, scenes, captions, audio/music suggestions, CTA

**2. New edge function: `supabase/functions/generate-social-post/index.ts`**
- Accepts `{ platform, topic, app_description, app_audience, tone, tone_description, reference_urls }`
- Uses Perplexity `sonar-pro` (same as article generator)
- Platform-specific system prompts that maintain the Skill Studio AI brand voice from AI Settings
- Streams response back using SSE (same pattern as `generate-article`)

**3. Route & navigation updates**
- Add `/social` route in `App.tsx`
- Add "Social Media" nav item in `Header.tsx` with a `Share2` icon

**4. Database: `social_posts` table (migration)**
- Columns: `id`, `platform` (enum: linkedin, youtube, twitter, instagram_carousel, instagram_reel), `topic`, `content`, `created_at`
- Saves generated posts for history/reuse

**5. Config update**
- Add `[functions.generate-social-post]` with `verify_jwt = false` to `supabase/config.toml`

### File changes summary
| File | Action |
|------|--------|
| `src/pages/SocialMedia.tsx` | Create |
| `supabase/functions/generate-social-post/index.ts` | Create |
| `src/App.tsx` | Add route |
| `src/components/Header.tsx` | Add nav item |
| `supabase/config.toml` | Add function config |
| DB migration | Create `social_posts` table |

