import type { Article } from "@/data/articles";

const API_BASE = "https://en.wikinews.org/w/api.php";

interface CMember {
  pageid: number;
  title: string;
}

interface WikiPage {
  pageid: number;
  title: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  fullurl?: string;
  categories?: { title: string }[];
  touched?: string;
}

const CATEGORY_MAP: Record<string, string> = {
  "Category:Politics and conflicts": "Marketing Strategy",
  "Category:Economy and business": "Sales Enablement",
  "Category:Science and technology": "Product Management",
  "Category:Culture and entertainment": "Customer Success",
  "Category:Crime and law": "Marketing Strategy",
  "Category:Disasters and accidents": "Sales Enablement",
  "Category:Health": "Customer Success",
  "Category:Environment": "Product Management",
};

function mapCategory(categories?: { title: string }[]): string {
  if (!categories?.length) return "Marketing Strategy";
  for (const cat of categories) {
    if (CATEGORY_MAP[cat.title]) return CATEGORY_MAP[cat.title];
  }
  return "Marketing Strategy";
}

function formatDate(touched?: string): string {
  if (!touched) return new Date().toLocaleDateString("en-US");
  // touched format: "2025-01-15T12:00:00Z"
  const d = new Date(touched);
  return isNaN(d.getTime())
    ? new Date().toLocaleDateString("en-US")
    : `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

export async function fetchLatestArticles(limit = 15): Promise<Article[]> {
  // Step 1: Get published article page IDs
  const listUrl = `${API_BASE}?action=query&list=categorymembers&cmtitle=Category:Published&cmsort=timestamp&cmdir=desc&cmlimit=${limit}&format=json&origin=*`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) throw new Error("Failed to fetch article list");
  const listData = await listRes.json();
  const members: CMember[] = listData?.query?.categorymembers ?? [];
  if (!members.length) return [];

  // Step 2: Get details for those pages
  const pageIds = members.map((m) => m.pageid).join("|");
  const detailUrl = `${API_BASE}?action=query&pageids=${pageIds}&prop=extracts|pageimages|info|categories&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&inprop=url&cllimit=50&format=json&origin=*`;
  const detailRes = await fetch(detailUrl);
  if (!detailRes.ok) throw new Error("Failed to fetch article details");
  const detailData = await detailRes.json();
  const pages: Record<string, WikiPage> = detailData?.query?.pages ?? {};

  // Preserve the order from categorymembers
  return members
    .map((m) => {
      const page = pages[String(m.pageid)];
      if (!page) return null;
      return {
        id: String(page.pageid),
        title: page.title,
        excerpt: page.extract?.slice(0, 160) ?? "",
        author: "Wikinews",
        date: formatDate(page.touched),
        category: mapCategory(page.categories),
        image: page.thumbnail?.source,
        readTime: `${Math.max(2, Math.ceil((page.extract?.length ?? 0) / 1000))} min read`,
        url: page.fullurl,
      } satisfies Article;
    })
    .filter(Boolean) as Article[];
}
