# Skill Studio AI — Framer CMS Plugin

This plugin syncs published articles from our Supabase backend into a **Managed Collection** in Framer.

## Setup

1. In your Framer project, go to **Plugins → Import from Folder** (or use the Framer CLI).
2. Point it at this `framer-plugin/` directory.
3. The plugin will create a managed collection called **"Skill Studio Blog Posts"** with fields for Title, Body, Excerpt, Category, Cover Image, and Published Date.
4. Click **"Sync from Skill Studio"** to pull all published articles.

## Configuration

Edit `framer-plugin/src/config.ts` and set your own Supabase project URL:

```ts
export const SUPABASE_URL = "https://rnshobvpqegttrpaowxe.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-key";
```

## How it works

- The plugin calls the `framer-sync-articles` Edge Function to fetch published articles.
- It maps each article to Framer CMS fields using `collection.addItems()`.
- Articles are identified by their Supabase `id`, so re-syncing updates existing items.

## Files

- `framer.json` — Plugin manifest with `configureManagedCollection` and `syncManagedCollection` modes.
- `src/App.tsx` — Main plugin UI.
- `src/config.ts` — API configuration.
