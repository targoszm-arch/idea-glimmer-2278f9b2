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

/**
 * Build the full URL path for an article based on its content type and
 * category. This is what's synced to Framer as the slug/url path so the
 * site routes to the right collection URL.
 *
 * Rules:
 *   user_guide, how_to  -> "help/knowledge-base/{slug}/documentation-articles"
 *   blog (with category)-> "{category-slug}/{slug}"
 *   blog (no category)  -> "{slug}"
 *
 * When the article title starts with the category name (e.g. title
 * "Features & Updates: Course Upgrade" with category "Features and Updates"),
 * the category prefix is stripped from the slug to avoid duplication like
 * "features-and-updates/features-updates-course-upgrade".
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

    // Strip duplicated category prefix from the article slug. Handles
    // both exact match ("features-and-updates-...") and slight variants
    // where joining words like "and" are dropped ("features-updates-...").
    if (articleSlug.startsWith(catSlug + "-")) {
      articleSlug = articleSlug.slice(catSlug.length + 1);
    } else {
      // Also check without common stop words (and, the, of, for, in, a)
      // to catch "features-updates-..." matching "features-and-updates"
      const catWords = catSlug.split("-").filter(w => !["and", "the", "of", "for", "in", "a"].includes(w));
      const catCoreStem = catWords.join("-");
      if (catCoreStem && articleSlug.startsWith(catCoreStem + "-")) {
        articleSlug = articleSlug.slice(catCoreStem.length + 1);
      }
    }

    return `${catSlug}/${articleSlug}`;
  }
  return base;
}
