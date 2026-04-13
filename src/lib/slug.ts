// Shared slug + URL path builder. Use this anywhere an article slug or
// url_path is generated so the rules stay in one place.

export type ContentType = "blog" | "user_guide" | "how_to";

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
    return `${toSlug(opts.category)}/${base}`;
  }
  return base;
}
