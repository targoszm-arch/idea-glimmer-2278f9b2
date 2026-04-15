// Server-side JSON-LD builder for generated articles.
//
// Why this exists: sonar-pro frequently produces invalid JSON when asked to
// output <script type="application/ld+json"> blocks directly — mismatched
// quotes, trailing commas, unescaped HTML entities in descriptions. The
// system prompt now forbids the model from emitting JSON-LD and instead has
// it emit a structured `faq_pairs` array inside ARTICLE_META_JSON. We build
// the FAQPage + BlogPosting schemas here where JSON syntax is guaranteed.

export interface ArticleMeta {
  keywords?: string[];
  tone?: string;
  headings?: string[];
  sources?: Array<{ title?: string; url?: string }>;
  facts?: string[];
  primary_focus?: string;
  faq_pairs?: Array<{ question: string; answer: string }>;
}

export interface JsonLdInput {
  title: string;           // exact H1
  description: string;     // META_DESCRIPTION
  articleSection?: string; // category / primary_focus
  meta?: ArticleMeta;
}

/**
 * Build two <script type="application/ld+json"> blocks — a FAQPage schema
 * (populated from meta.faq_pairs) and a BlogPosting schema. Returns an empty
 * string when there's nothing useful to emit.
 */
export function buildArticleJsonLd({ title, description, articleSection, meta }: JsonLdInput): string {
  const blocks: string[] = [];

  const faqPairs = meta?.faq_pairs?.filter(f => f?.question && f?.answer) ?? [];
  if (faqPairs.length > 0) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqPairs.map(f => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    };
    blocks.push(`<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`);
  }

  if (title) {
    const today = new Date().toISOString().split("T")[0];
    const blogSchema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description: description || "",
      datePublished: today,
      dateModified: today,
    };
    if (articleSection) blogSchema.articleSection = articleSection;
    if (meta?.keywords?.length) blogSchema.keywords = meta.keywords.join(", ");
    blocks.push(`<script type="application/ld+json">${JSON.stringify(blogSchema)}</script>`);
  }

  return blocks.join("\n");
}

/**
 * Append JSON-LD blocks to an article's HTML body just before any closing
 * `</body>` tag, or at the end if the content isn't a full document. Safe to
 * call with an empty jsonLd — returns the html unchanged in that case.
 */
export function injectJsonLd(html: string, jsonLd: string): string {
  if (!jsonLd) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${jsonLd}\n</body>`);
  return `${html}\n${jsonLd}`;
}
