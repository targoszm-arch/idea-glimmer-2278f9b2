

# Switch to Wikinews/Wikimedia API for Articles

## Overview
Replace the static mock data in `src/data/articles.ts` with live articles fetched from the **Wikinews MediaWiki API**. The Wikinews API is public, requires no API key, and supports CORS via `origin=*`, so we can call it directly from the frontend -- no backend/edge function needed.

## API Strategy

We'll use the Wikinews MediaWiki Action API (`https://en.wikinews.org/w/api.php`) with two queries:

1. **Get published article titles** -- `action=query&list=categorymembers&cmtitle=Category:Published&cmsort=timestamp&cmdir=desc&cmlimit=15`
2. **Get article details (extracts + thumbnails)** -- Use the page IDs from step 1 as a generator or `pageids` param with `prop=extracts|pageimages|categories|info` to get snippets, images, and metadata.

Both calls use `origin=*&format=json` for CORS support.

## Implementation Steps

### 1. Create a Wikinews API service
**New file: `src/lib/api/wikinews.ts`**
- Define types for the API response (`WikiArticle` with title, extract, thumbnail, categories, timestamp)
- `fetchLatestArticles(limit)` -- fetches published articles from Wikinews, combines both API calls, and returns normalized `Article[]` objects
- Map Wikinews categories to the existing topic cluster names where possible
- Handle errors gracefully with fallback to empty arrays

### 2. Create a custom hook for articles
**New file: `src/hooks/useWikinewsArticles.ts`**
- Use `@tanstack/react-query` (`useQuery`) to fetch and cache articles
- Expose `{ featuredArticle, featuredPosts, gridArticles, isLoading, error }`
- Split the fetched articles: first = featured, next 5 = featured posts sidebar, next 4 = grid
- Stale time of 5 minutes to avoid excessive API calls

### 3. Update `src/data/articles.ts`
- Keep the `Article` interface and `topicClusters` array (these remain static)
- Remove `featuredArticle`, `featuredPosts`, and `gridArticles` exports (now fetched live)

### 4. Update `HeroSection.tsx`
- Accept articles via the hook instead of static imports
- Show `Skeleton` loading placeholders while data loads
- Use Wikinews thumbnail for the hero image (fall back to existing `hero-featured.jpg` if none)
- Link article titles to their Wikinews source URL

### 5. Update `ContentGrid.tsx`
- Use the hook for grid articles instead of static imports
- Show skeleton cards while loading
- Use Wikinews thumbnails when available, fall back to existing placeholder images
- Link cards to Wikinews article URLs

### 6. Update `Index.tsx`
- Call `useWikinewsArticles()` at the page level and pass data down to `HeroSection` and `ContentGrid` as props (single fetch, shared data)

---

## Technical Details

**Wikinews API URL example:**
```text
https://en.wikinews.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Published&cmsort=timestamp&cmdir=desc&cmlimit=15&format=json&origin=*
```

Then enrich with extracts/thumbnails:
```text
https://en.wikinews.org/w/api.php?action=query&pageids=ID1|ID2|...&prop=extracts|pageimages|info&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&inprop=url&format=json&origin=*
```

**Key decisions:**
- No backend needed -- Wikinews API is fully public with CORS
- Uses React Query for caching, loading states, and error handling
- Skeleton loading states use the existing `Skeleton` component from shadcn/ui
- Article links open Wikinews in a new tab (`target="_blank"`)
- `topicClusters` stays static since Wikinews categories don't map 1:1

