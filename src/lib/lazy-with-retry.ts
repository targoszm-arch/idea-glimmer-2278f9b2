import { lazy, type ComponentType } from "react";

// React.lazy that survives a stale-chunk failure after deploy.
//
// When Vercel ships a new build, every code-split chunk gets a new hash. Tabs
// that were open before the deploy have the old index.html cached and try to
// fetch /assets/Integrations-OLD_HASH.js — which 404s. The default React.lazy
// just bubbles the error, blanking the page until the user does a hard reload.
//
// This wrapper:
//   1. Retries the dynamic import once after 500ms (handles flaky network)
//   2. If it still fails AND we haven't already done a reload-for-stale-chunk
//      this session, sets a sessionStorage flag and triggers location.reload(),
//      which fetches the new index.html and the chunk by its new hash.
//   3. If we've already reloaded once and it's STILL failing, re-throws so the
//      regular error UI surfaces (otherwise we'd be in an infinite reload loop).
const RELOAD_KEY = "lazy-chunk-reloaded";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const isChunkError =
        err?.name === "ChunkLoadError" ||
        /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
          String(err?.message || err),
        );
      if (!isChunkError) throw err;

      // One retry to weather a transient network blip.
      try {
        await new Promise((r) => setTimeout(r, 500));
        return await factory();
      } catch (retryErr) {
        // Final fallback: reload index.html (once per session) to pull the
        // current bundle. If we already reloaded, propagate so the user sees
        // a real error instead of an infinite refresh.
        if (typeof window !== "undefined" && !sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          // Return a never-resolving promise so React doesn't render an error
          // frame in the split-second before the reload kicks in.
          return new Promise(() => {}) as any;
        }
        throw retryErr;
      }
    }
  });
}
