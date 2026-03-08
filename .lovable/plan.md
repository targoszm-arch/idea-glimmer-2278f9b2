

# Plan: Transform Content Hub into AI Content Generation Platform

## Overview

Convert the static "Insight Flow" content hub into a FeedPal-style AI content generation platform with four core features: AI article generation, content library, AI content ideas, and a rich text editor. Uses external Supabase for backend, no authentication.

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Frontend (React + Vite)                    │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │Dashboard │ │ Editor   │ │ Ideas Gen   │ │
│  │(Library) │ │(TipTap)  │ │             │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
│         │           │            │          │
│         └───────────┼────────────┘          │
│                     │                       │
│              Supabase Client                │
└─────────────────────┼───────────────────────┘
                      │
┌─────────────────────┼───────────────────────┐
│  Supabase Backend                           │
│  ┌──────────────────────────────────────┐   │
│  │ Edge Function: generate-content      │   │
│  │  → Lovable AI Gateway (Gemini Flash) │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ Database: articles, content_ideas    │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Database Schema

**Table: `articles`**
- `id` (uuid, PK), `title` (text), `slug` (text), `content` (text — HTML from editor), `excerpt` (text), `meta_description` (text), `category` (text), `status` (text: draft/published), `cover_image_url` (text), `created_at`, `updated_at`

**Table: `content_ideas`**
- `id` (uuid, PK), `topic` (text), `title_suggestion` (text), `strategy` (text: TOFU/MOFU/BOFU), `category` (text), `status` (text: unused/used), `created_at`

RLS disabled (no auth needed).

## Edge Functions

1. **`generate-article`** — Takes topic/title + optional tone/context, calls Lovable AI Gateway with streaming, returns generated article (title, body in HTML, excerpt, meta description)
2. **`generate-ideas`** — Takes niche/product description, generates 5-10 content ideas using TOFU/MOFU/BOFU strategy via Lovable AI
3. **`improve-article`** — Takes existing article content + instruction (e.g. "make it more conversational"), returns improved version via streaming

## New Pages & Navigation

Replace existing static pages with:

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Content library — grid/list of all articles with status filters |
| `/new` | New Article | AI generation form + rich text editor |
| `/edit/:id` | Edit Article | Load existing article into editor |
| `/ideas` | Content Ideas | Generate and browse AI topic suggestions |
| `/article/:id` | Article Preview | Read-only rendered article (keep existing) |

**Header nav** updates: "Library" (home), "New Article", "Content Ideas"

## Key Components to Build

1. **`DashboardPage`** — Article library with cards showing title, status badge (draft/published), date, category. Filter by status. "New Article" CTA button.

2. **`ArticleEditor`** — Rich text editor using **TipTap** (free, React-native, extensible). Toolbar with bold/italic/headings/links/lists. Side panel with AI assistant that can generate, improve, or extend content via streaming.

3. **`GenerateArticleForm`** — Input fields: topic, target audience, tone (dropdown), word count target. "Generate" button triggers edge function with streaming response that populates the editor.

4. **`ContentIdeasPage`** — Input: describe your product/niche. Button: "Generate Ideas". Displays cards with TOFU/MOFU/BOFU labels. Click idea → navigates to `/new` pre-filled with that topic.

5. **`AIAssistantPanel`** — Sidebar in editor. Text input to give instructions ("add more examples", "make it shorter"). Streams improved content back.

## Implementation Steps

1. **Connect Supabase** — Connect external Supabase project, create `articles` and `content_ideas` tables with migrations
2. **Set up Lovable AI** — Ensure `LOVABLE_API_KEY` is available, create the 3 edge functions
3. **Install TipTap** — Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` packages
4. **Build Dashboard page** — Article library with CRUD operations via Supabase client
5. **Build Article Editor** — TipTap editor with formatting toolbar + save to Supabase
6. **Build AI Generation flow** — Generate form → streaming edge function → populate editor
7. **Build Content Ideas page** — Idea generation + browsing + "use this idea" flow
8. **Build AI Assistant panel** — Inline improvement/iteration via streaming in editor sidebar
9. **Update routing & navigation** — Replace old nav with new app structure, keep article preview page

## What Gets Removed

- Static homepage (HeroSection, TopicClusters, ContentGrid, NewsletterSection)
- Static Blog, Newsletters, Resources, Podcasts pages
- Hardcoded article data in `src/data/articles.ts` and `src/pages/Article.tsx`
- Static asset images (replaced by AI-generated or URL-based cover images)

## What Gets Kept

- Header component (updated nav items)
- Footer component
- Design system (Satoshi font, color variables, Tailwind config)
- Article preview page (updated to fetch from Supabase)
- Framer Motion animations pattern

## Dependencies to Add

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder` — Rich text editor
- `react-markdown` — For rendering AI streaming output before insertion

