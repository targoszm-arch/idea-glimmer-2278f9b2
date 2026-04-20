// Shared slug + URL path builder. Use this anywhere an article slug or
// url_path is generated so the rules stay in one place.

export type ContentType = "blog" | "user_guide" | "how_to" | "newsletter";

/** Convert any string into a URL-safe kebab-case slug. */
export function toSlug(input: string, maxLen = 80): string {
  if (!input) return "article";
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) return "article";
  return s.substring(0, maxLen).replace(/-+$/, "");
}

// CMS detail-page path in Framer where blog articles are rendered.
// Must match the route configured in the Framer project.
const FRAMER_BLOG_COLLECTION_PAGE = "features-updates";

/**
 * Build the full URL path for an article based on its content type and
 * category. This is what's synced to Framer as the slug/url path so the
 * site routes to the right collection URL.
 *
 * Rules:
 *   user_guide, how_to  -> "help/knowledge-base/{slug}/documentation-articles"
 *   blog (with category)-> "features-updates/{category-slug}-{slug}"
 *   blog (no category)  -> "{slug}"
 *
 * Framer managed collections auto-prepend the Category field slug to each
 * item's slug (e.g. slug "my-article" with category "Features & Updates"
 * becomes "features-updates-my-article"). The CMS detail page is mounted at
 * /features-updates/, so the live URL is
 * /features-updates/features-updates-my-article.
 *
 * When the article title starts with the category name, the category prefix
 * is stripped from the article slug before computing the final path, so
 * Framer's auto-prepend doesn't double it.
 */
export function buildUrlPath(opts: {
  title: string;
  contentType: ContentType;
  category?: string | null;
  existingSlug?: string | null;
}): string {
  const base = toSlug(opts.existingSlug || opts.title);
  if (opts.contentType === "user_guide" || opts.contentType === "how_to") {
    return `help/knowledge-base/${base}/documentation-articles`;
  }
  if (opts.category && opts.category.trim()) {
    const catSlug = toSlug(opts.category);
    let articleSlug = base;

    // Strip category prefix from the article slug if it was already included
    // (e.g. title "Features & Updates: New Course" with category
    // "Features & Updates"). Without this, Framer's auto-prepend would
    // produce "features-updates-features-updates-new-course".
    if (articleSlug.startsWith(catSlug + "-")) {
      articleSlug = articleSlug.slice(catSlug.length + 1);
    } else {
      // Also handle variants where stop words (and, the, of, …) are present
      // in the category slug but dropped in the article slug.
      const catWords = catSlug.split("-").filter(w => !["and", "the", "of", "for", "in", "a"].includes(w));
      const catCoreStem = catWords.join("-");
      if (catCoreStem && articleSlug.startsWith(catCoreStem + "-")) {
        articleSlug = articleSlug.slice(catCoreStem.length + 1);
      }
    }

    return `${FRAMER_BLOG_COLLECTION_PAGE}/${catSlug}-${articleSlug}`;
  }
  return base;
}
