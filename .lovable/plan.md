

# Content Hub — Comprehensive Template Documentation

## 13. Suggested Template Name and Slug

- **Template Name**: Insight Flow — B2B Content Marketing Hub
- **URL Slug**: insight-flow

---

## 1. UI/UX Features & Components

### Interactive Elements
- **Mobile hamburger menu**: Animated expand/collapse using Framer Motion `AnimatePresence` with height + opacity transitions in `Header.tsx`
- **Newsletter signup form**: Two-state component (form → success) with email validation, animated success confirmation using `motion.div` scale transition in `NewsletterSection.tsx`
- **Resource download buttons**: "Get Free" CTA buttons on gated content cards in `Resources.tsx`
- **Newsletter subscribe buttons**: Per-newsletter subscription CTAs in `Newsletters.tsx`
- **Podcast play overlay**: Hover-triggered play icon overlay on episode thumbnails (`opacity-0 group-hover:opacity-100`) in `Podcasts.tsx`
- **Scroll progress bar**: Fixed-top reading progress indicator using `useScroll` + `useSpring` from Framer Motion in `Article.tsx`

### Layout Systems
- **CSS Grid**: Used extensively across all pages
  - Homepage hero: `grid-cols-1 lg:grid-cols-[1fr_380px]` (article + sidebar)
  - Topic clusters: `grid-cols-2 md:grid-cols-4`
  - Content grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  - Blog: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
  - Resources: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
  - Newsletters: `grid-cols-1 md:grid-cols-2`
- **Flexbox**: Header layout, footer, article metadata, podcast episode rows
- **Centered content container**: Tailwind `container` with `center: true`, `padding: "2rem"`, max-width `1400px` at 2xl

### Navigation Patterns
- **Sticky header**: `sticky top-0 z-50` with backdrop blur (`bg-background/95 backdrop-blur`)
- **Desktop nav**: Horizontal link bar with 4 items (Blog, Newsletters, Resources, Podcasts)
- **Mobile nav**: Animated collapsible menu with `AnimatePresence`
- **Back navigation**: `← Back to Home` link on article pages using `react-router-dom` `Link`
- **Anchor links**: `#newsletter` scroll target from header Subscribe button
- **404 page**: Custom not-found with return-to-home link

### Content Organization
- **Topic clusters**: 4 categories with article counts (Marketing Strategy: 47, Sales Enablement: 38, Customer Success: 42, Product Management: 35)
- **Featured posts sidebar**: Desktop-only (`hidden lg:block`) list of 5 posts with dividers
- **Category labels**: Displayed as colored text (`text-primary`) on blog cards and article pages
- **Content type badges**: Resource type pills (`bg-primary/10 px-2.5 py-1 rounded-full`) on resource cards
- **Recent Issues list**: Table-style list of past newsletter issues in `Newsletters.tsx`

### Visual Effects & Animations (Framer Motion)
- **Page entrance**: `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}` on all page hero sections
- **Staggered card loading**: `transition={{ delay: i * 0.05–0.1 }}` on grid items
- **Card hover lift**: `whileHover={{ y: -4, scale: 1.02 }}` on content cards
- **Card press effect**: `whileTap={{ scale: 0.98 }}` on interactive cards
- **Image hover zoom**: CSS `transition-transform duration-300 group-hover:scale-105` on card images
- **Hero image hover**: Framer `whileHover={{ scale: 1.03 }}` on featured image
- **Sidebar slide-in**: `initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}` with 0.2s delay
- **Scroll-linked progress bar**: `motion.div` with `style={{ scaleX }}` driven by `useScroll` + `useSpring({ stiffness: 100, damping: 30 }}`
- **Newsletter success animation**: `initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}`
- **Button micro-interactions**: `hover:scale-105 active:scale-95` and `hover:scale-[1.02]` CSS transitions

### Form Elements
- **Email input**: Styled with semi-transparent borders (`border-primary-foreground/30 bg-primary-foreground/10`) and custom placeholder colors
- **Subscribe button**: Rounded with scale transitions
- **Form state management**: React `useState` for email value and submission state

---

## 2. Typography & Design System

### Fonts
- **Font family**: Satoshi (loaded from `api.fontshare.com/v2/css`)
- **Weights loaded**: 400 (body), 500 (medium), 700 (headings), 900 (black — available but not actively used)
- **Fallback stack**: `system-ui, sans-serif`
- **Applied via**: Both CSS (`font-family: 'Satoshi'` on body) and Tailwind config (`fontFamily.sans`)

### Typography Hierarchy
- **h1**: `text-3xl md:text-4xl font-bold` (article pages, section pages); `text-2xl md:text-3xl lg:text-4xl font-bold` (homepage hero)
- **h2**: `text-2xl font-bold` (article subheadings, section headers); `text-3xl font-bold` (newsletter CTA); `text-lg font-bold` (card titles)
- **h3**: `text-sm font-bold` / `text-base font-bold` (card titles); `text-lg font-bold` (inline CTA)
- **Body text**: `text-lg leading-relaxed` (article body); `text-sm` / `text-base` (descriptions)
- **Captions/metadata**: `text-xs text-muted-foreground` (dates, authors, durations)
- **Category labels**: `text-xs font-semibold text-primary`

### Type Scale
- Fixed Tailwind rem values: `text-xs` (0.75rem), `text-sm` (0.875rem), `text-base` (1rem), `text-lg` (1.125rem), `text-2xl` (1.5rem), `text-3xl` (1.875rem), `text-4xl` (2.25rem)
- Responsive scaling via breakpoint prefixes (`md:text-4xl`, `lg:text-4xl`)

### Line Heights & Spacing
- `leading-tight` on headings (1.25)
- `leading-snug` on card titles (1.375)
- `leading-relaxed` on article body (1.625)
- Default line height for all other text

### Text Utilities
- `line-clamp-2` for truncating card excerpts and titles
- `text-balance` utility defined (CSS `text-wrap: balance`)
- `tracking-tight` on logo text

---

## 3. Color System

### Primary Brand Colors
- **Light mode**: `#0071e3` (Apple systemBlue) — used for links, buttons, CTAs, category labels, progress bar, icon backgrounds
- **Dark mode**: `#009aff` — brighter blue for dark backgrounds
- **Primary foreground**: `#fff` in both modes

### Destructive/Error Colors
- **Light**: `#e30000` (systemRed)
- **Dark**: `#ff453a`

### Neutral Scale (oklch)
- Light mode: `oklch(1 0 0)` (background) → `oklch(0.985)` → `oklch(0.97)` (secondary/muted) → `oklch(0.922)` (border/input) → `oklch(0.708)` (ring) → `oklch(0.556)` (muted-foreground) → `oklch(0.205)` (secondary-foreground) → `oklch(0.145)` (foreground)
- Dark mode: `oklch(0.145)` (background) → `oklch(0.205)` (card) → `oklch(0.269)` (secondary/popover) → `oklch(0.556)` (ring) → `oklch(0.708)` (muted-foreground) → `oklch(0.985)` (foreground)

### Tint Usage Patterns
- `bg-primary/10` — icon backgrounds, type badges
- `bg-primary/20` — implied for filter pills
- `bg-primary/30` — inline CTA background tint
- `border-primary/30` — resource card borders, inline CTA borders
- `bg-primary-foreground/20` — newsletter icon circle
- `bg-primary-foreground/10` — newsletter email input background
- `border-primary-foreground/30` — newsletter email input border
- `text-primary-foreground/80` — newsletter subtitle
- `text-primary-foreground/50` — newsletter placeholder
- `bg-foreground/30` — podcast play overlay
- `bg-secondary/50` — footer background, newsletter issue hover

### Dark Mode
- Full oklch dark palette defined in CSS `:root` `.dark` class
- Toggled via `darkMode: ["class"]` in Tailwind config
- No toggle UI currently implemented (dark mode is supported but not user-switchable)

---

## 4. Spacing & Layout System

### Spacing Scale
- Standard Tailwind spacing (4px increments)
- Section vertical padding: `py-8` (32px) to `py-16` (64px)
- Container horizontal padding: `padding: "2rem"` (32px)
- Card padding: `p-4` to `p-6` (16–24px)
- Grid gaps: `gap-3` to `gap-8` (12–32px)
- Component spacing: `space-y-2` to `space-y-5` (8–20px)

### Border Radius
- `--radius: 0.625rem` (10px) — base radius
- `rounded-xl` (12px) — cards, images, inputs
- `rounded-2xl` (16px) — podcast icon container
- `rounded-lg` (var(--radius)) — buttons, containers
- `rounded-full` — badges, avatar circles, icon containers

### Shadows
- `shadow-lg` — card hover state
- `hover:shadow-lg` — topic clusters, podcast episodes
- No elevation system beyond Tailwind defaults

### Container
- Max width: `1400px` at `2xl` breakpoint
- Centered with `2rem` padding
- Article content: `max-w-3xl mx-auto px-6` (narrower reading column)
- Newsletter content: `max-w-2xl mx-auto` (centered CTA block)

---

## 5. Responsive Design & Mobile

### Breakpoints
- Mobile: < 640px (default)
- `sm`: 640px+ (newsletter form goes horizontal)
- `md`: 768px+ (grid expansions, larger headings)
- `lg`: 1024px+ (full desktop layouts, sidebar visible)
- `2xl`: 1400px (container max-width)

### Mobile-Specific Features
- **Hamburger menu**: `md:hidden` toggle button with animated dropdown
- **Desktop nav hidden on mobile**: `hidden md:flex`
- **Subscribe button hidden on small screens**: `hidden sm:inline-flex`
- **Featured sidebar hidden on mobile**: `hidden lg:block`
- **Stacked newsletter form**: `flex-col sm:flex-row` for email + button

### Layout Adaptations
- Grids collapse from 4→2→1 columns, 3→2→1, or 2→1 across breakpoints
- Hero changes from side-by-side (article + sidebar) to single column
- Footer switches from horizontal to vertical alignment (`flex-col md:flex-row`)
- Typography scales down on mobile (e.g., `text-2xl md:text-3xl lg:text-4xl`)

### Mobile Hook
- Custom `useIsMobile()` hook using `window.matchMedia` at 768px breakpoint (available but not actively consumed by any rendered component)

---

## 6. Performance & Optimization

### Image Handling
- **Lazy loading**: `loading="lazy"` on content grid images and blog post images
- **Aspect ratio enforcement**: `aspect-square`, `aspect-[16/9]`, `aspect-[16/10]` to prevent layout shift
- **Static imports**: All images imported as ES modules from `src/assets/` (bundled by Vite)
- **Format**: JPEG files sourced from Unsplash

### Build & Bundling
- **Vite** with `@vitejs/plugin-react-swc` (SWC for fast compilation)
- **Code splitting**: React Router with per-route components (automatic code splitting via Vite)
- No explicit chunking strategy or dynamic `React.lazy()` imports

### Loading States
- No skeleton loaders or suspense boundaries currently implemented
- Framer Motion staggered animations provide perceived loading sequence

---

## 7. Accessibility Features

### Semantic HTML
- `<header>`, `<main>`, `<footer>`, `<nav>`, `<article>`, `<section>`, `<aside>` used correctly
- `<h1>`–`<h3>` hierarchy maintained per page
- `<ul>` / `<li>` for featured posts list
- `<form>` element with `required` attribute on email input

### ARIA & Keyboard
- shadcn/ui components include built-in ARIA (dialog, toast, tooltip, etc.)
- `aria-describedby`, `aria-invalid` in form components
- Standard `<a>` and `<button>` elements (keyboard-focusable by default)
- `type="email"` for semantic input

### Visual
- `alt` text on all images
- Color contrast: oklch neutral scale provides strong foreground/background contrast
- Focus styles via Tailwind's `focus-visible:ring-2 focus-visible:ring-ring`

### Gaps
- No skip-to-content link
- No explicit focus management on route transitions
- No `aria-label` on icon-only buttons (search, menu toggle)

---

## 8. SEO & Discoverability

### Meta Tags
- `<title>`: "Content Hub — Marketing Insights & Strategy"
- `<meta name="description">`: "Your central hub for marketing strategy, sales enablement, and customer success insights."
- `<meta name="author">`: "Content Hub"

### Open Graph
- `og:type`: website
- `og:title`, `og:description`, `og:image`: All configured with preview image URL

### Twitter Cards
- `twitter:card`: summary_large_image
- `twitter:site`: @Lovable
- `twitter:title`, `twitter:description`, `twitter:image`: All configured

### robots.txt
- Allows all major bots: Googlebot, Bingbot, Twitterbot, facebookexternalhit, wildcard

### Gaps
- No structured data / JSON-LD
- No sitemap.xml
- No canonical URLs
- No per-page dynamic meta tags (all pages share the same `<title>`)

---

## 9. Content Features

### Content Types (6 distinct types)
1. **Featured article** — Hero treatment on homepage with large image, title, excerpt, author, date
2. **Blog posts** — 9 articles in 3-column grid with category, image, excerpt, author, date
3. **Long-form articles** — 10 unique articles with full body content, subheadings (##), author bios (name + role), read time, category, and inline CTA
4. **Newsletters** — 4 newsletter products with name, description, frequency, subscriber count, and subscribe CTA; plus 6 past issues
5. **Resources / Gated content** — 6 downloadable resources (eBooks, templates, reports, checklists, video courses) with type badge, description, download count, and CTA
6. **Podcast episodes** — 6 episodes with guest info, duration, date, description, and hover-play overlay

### Content Organization
- **4 topic clusters** with article counts
- **Category labels** on cards and article pages
- **Featured/curated** content hierarchy (hero → sidebar → grid)

### Content Discovery
- Featured article hero section
- Featured posts sidebar (5 posts)
- Topic cluster navigation cards
- Content grid (latest 4 articles)
- Cross-page newsletter CTA modules
- Inline article CTA ("Want more insights like this?")

### Gaps
- No search functionality
- No filtering or sorting
- No pagination or infinite scroll
- No related articles suggestions

---

## 10. Theming & Customization

### Dark Mode Support
- Full dark color scheme defined in CSS variables (oklch)
- Tailwind `darkMode: ["class"]` configuration
- `next-themes` package installed (available but no `ThemeProvider` or toggle rendered)
- No user-facing theme switch currently in the UI

### CSS Custom Properties
- 25+ CSS variables for colors, border radius
- All component colors reference CSS variables via `hsl(var(--*))` pattern
- Easy to re-theme by changing variable values

---

## 11. Integration & Extension Points

### Third-Party Integrations
- None currently active. No analytics, email service, CRM, or payment integrations.

### Lovable Cloud
- Not connected. No Supabase, edge functions, database, or authentication configured.

### Prepared Extension Points
- Newsletter forms ready for email service integration (currently client-side only)
- Resource download buttons ready for gated content / lead capture flow
- `@tanstack/react-query` installed and configured (QueryClient initialized) — ready for API data fetching
- `react-hook-form` + `zod` installed — ready for complex form validation

---

## 12. Developer Experience Features

### Tooling
- **TypeScript**: Strict mode, path aliases (`@/` → `src/`)
- **ESLint**: `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`
- **Vite**: SWC-based React plugin for fast HMR
- **PostCSS**: Autoprefixer + Tailwind CSS

### Testing
- **Vitest** configured with jsdom environment
- **@testing-library/react** and **@testing-library/jest-dom** installed
- `src/test/setup.ts` and `src/test/example.test.ts` present

### Code Quality
- TypeScript interfaces for data models (`Article`, `ArticleData`)
- Component-per-file architecture
- Centralized data layer (`src/data/articles.ts`)
- Consistent file naming and folder structure

---

## Summary of Actually-Used Components

**Custom components rendered in the app** (11):
- `Header`, `HeroSection`, `TopicClusters`, `ContentGrid`, `NewsletterSection`, `Footer` (homepage)
- `NavLink` (navigation utility)
- Pages: `Index`, `Blog`, `Newsletters`, `Resources`, `Podcasts`, `Article`, `NotFound`

**shadcn/ui components actually rendered**: `Toaster` (toast), `Sonner` (sonner), `TooltipProvider` (tooltip)

**~50+ shadcn/ui component files exist in `/components/ui/` but are NOT used** in any rendered page. These include: accordion, alert-dialog, avatar, badge, breadcrumb, calendar, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, switch, table, tabs, textarea, toggle, toggle-group, and others.

