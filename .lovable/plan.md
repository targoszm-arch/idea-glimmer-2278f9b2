## Plan: Create shared PageLayout component and fix EditArticle button placement

### Problem

- **EditArticle** has action buttons (Save Draft, Publish, AI Assistant) at the **bottom** of the editor, while **NewArticle** has them in the **top header area**.
- Every page independently imports and renders `<Header />` and `<Footer />`, duplicating the same wrapper structure (`min-h-screen bg-background` → Header → main container → Footer).

### Solution

Create a single `**PageLayout**` component that wraps all pages, then fix EditArticle to move its action buttons to the top like NewArticle.

### Changes

**1. Create `src/components/PageLayout.tsx**` — shared layout shell

```tsx
// Renders: Header + <main className="container py-8">{children}</main> + Footer
// Optional props: hideFooter, className (for main customization)
```

All pages currently follow this pattern:

```tsx
<div className="min-h-screen bg-background">
  <Header />
  <main className="container py-8">...</main>
  <Footer /> {/* most pages, not EditArticle/NewArticle */}
</div>
```

The new component consolidates this.

**2. Update `src/pages/EditArticle.tsx**` — move buttons to top action bar

Move the Save Draft / Publish / AI Assistant buttons from below the editor (lines 260-274) into the top bar alongside "Back to Library" and "Delete" (lines 186-195), matching NewArticle's layout. Replace the raw Header/wrapper with `<PageLayout>`.

**3. Update all other pages to use `<PageLayout>**`

Pages to update (7 total):

- `Dashboard.tsx`
- `NewArticle.tsx`
- `EditArticle.tsx`
- `ContentIdeas.tsx`
- `Article.tsx`
- `SocialMedia.tsx`
- `BrandAssets.tsx`
- `AISettings.tsx`

Each page: remove `<Header />`, `<Footer />`, and the outer `<div className="min-h-screen bg-background">` / `<main className="container py-8">` wrapper, replacing with `<PageLayout>...</PageLayout>`.

4. Edit page is missing reading time, meaning that the already published articles in framer cms are missing this field. Update to the layout to be shared for new article and editted article to be exactly the same

### Files touched

- **New**: `src/components/PageLayout.tsx`
- **Edit**: `src/pages/EditArticle.tsx` (move buttons to top + use PageLayout)
- **Edit**: 7 other page files (swap to PageLayout)