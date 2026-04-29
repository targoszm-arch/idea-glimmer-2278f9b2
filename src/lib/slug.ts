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
 * Build the full URL path for an article.
 *
 * Rules:
 *   user_guide, how_to → "help/knowledge-base/{slug}/documentation-articles"
 *   blog / newsletter  → "{category-slug}/{article-slug}"
 *
 * URL format on skillstudio.ai:
 *   /features-updates/{slug}
 *   /course-authoring/{slug}
 *   /industry-news/{slug}
 *   /compliance-training/{slug}
 *   etc.
 *
 * The category slug is derived from the article's category field.
 * Falls back to "features-updates" if no category is set.
 */
export function buildUrlPath(opts: {
  title: string;
  contentType: ContentType;
  category?: string | null;
  existingSlug?: string | null;
}): string {
  const slug = toSlug(opts.existingSlug || opts.title);
  const categorySlug = opts.category ? toSlug(opts.category) : "features-updates";

  // Knowledge Base lives under /help/knowledge-base/.../documentation-articles
  // on skillstudio.ai, regardless of content_type. Match by category slug
  // so blog/how-to/user_guide articles in the KB collection all land there.
  if (categorySlug.startsWith("knowledge-base") ||
      opts.contentType === "user_guide" ||
      opts.contentType === "how_to") {
    return `help/knowledge-base/${slug}/documentation-articles`;
  }

  return `${categorySlug}/${slug}`;
}
