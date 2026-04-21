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
 * Build the full URL path for an article based on its content type.
 * This is what's synced to Framer as the url_path field.
 *
 * Rules:
 *   user_guide, how_to -> "help/knowledge-base/{slug}/documentation-articles"
 *   blog / newsletter  -> "features-updates/{slug}"
 *
 * Framer URLs are {collection-page}/{slug} where slug is the plain article
 * slug — no category prefix. e.g. /features-updates/ai-literacy-future-workforce
 */
export function buildUrlPath(opts: {
  title: string;
  contentType: ContentType;
  category?: string | null;
  existingSlug?: string | null;
}): string {
  const slug = toSlug(opts.existingSlug || opts.title);
  if (opts.contentType === "user_guide" || opts.contentType === "how_to") {
    return `help/knowledge-base/${slug}/documentation-articles`;
  }
  return `${FRAMER_BLOG_COLLECTION_PAGE}/${slug}`;
}
