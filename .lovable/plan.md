

## Add a Public Landing Page

### Problem
When a new visitor finds the website link, they land directly on `/login` — there's no context about what the product does, its pricing, or why they should sign up.

### Solution
Create a public landing page at `/` that introduces the product and drives signups. Move the authenticated dashboard to `/dashboard`.

### What to Build

**1. Landing page (`src/pages/Landing.tsx`)**
- Hero section: product name, tagline, brief description of AI content generation features
- Features section: highlight key capabilities (article generation, social posts, HeyGen videos, infographics)
- Pricing section: €49 plan with 200 credits, credit cost breakdown, top-up options (€25/100cr, €50/200cr)
- Two CTAs: "Get Started" → `/signup`, "Sign In" → `/login`

**2. Update routing (`src/App.tsx`)**
- `/` → `Landing` (public, but redirect to `/dashboard` if already authenticated)
- `/dashboard` → `Dashboard` (protected)
- Update all internal navigation links that point to `/` to use `/dashboard` instead

**3. Update `ProtectedRoute`**
- Redirect unauthenticated users to `/` (landing) instead of `/login`

**4. Update internal links**
- Header logo link: `/` → `/dashboard`
- Post-login redirect in `Login.tsx`: `/` → `/dashboard`
- Any other internal `navigate("/")` calls → `/dashboard`

### Files to Create/Modify
- **Create**: `src/pages/Landing.tsx`
- **Modify**: `src/App.tsx`, `src/pages/Login.tsx`, `src/components/Header.tsx`, `src/components/ProtectedRoute.tsx`, and any files with `navigate("/")`

