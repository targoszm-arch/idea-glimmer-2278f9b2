// Shared slug + URL path builder. Use this anywhere an article slug or
// url_path is generated so the rules stay in one place.

export type ContentType = "blog" | "user_guide" | "how_to" | "newsletter";

/**
 * Convert any string into a URL-safe kebab-case slug.
 * Default max length is 200 (Framer / common CMS practical ceiling).
 * Crucially: when truncating, cut at the last word boundary so the slug
 * never ends mid-word. A slug ending in `-actions` cut to 64 chars used
 * to become `business-a`, which then produced /industry-news/business-a
 * \u2014 Framer's auto-generated slug from the same title was the full word,
 * so every truncated URL 404'd.
 */
export function toSlug(input: string, maxLen = 200): string {
  if (!input) return "article";
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) return "article";
  if (s.length <= maxLen) return s;
  // Cut to last word boundary, never mid-word.
  const sliced = s.slice(0, maxLen);
  const lastDash = sliced.lastIndexOf("-");
  return (lastDash > 0 ? sliced.slice(0, lastDash) : sliced).replace(/-+$/, "");
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
