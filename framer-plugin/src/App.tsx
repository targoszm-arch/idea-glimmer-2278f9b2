import { framer } from "framer-plugin";
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config";

// ── Field schema for the managed collection ──
const FIELDS = [
  { name: "Title", type: "string" as const },
  { name: "Body", type: "formattedText" as const },
  { name: "Excerpt", type: "string" as const },
  { name: "Category", type: "string" as const },
  { name: "Cover Image", type: "image" as const },
  { name: "Meta Description", type: "string" as const },
  { name: "Published Date", type: "date" as const },
] as const;

type Article = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_description: string;
  category: string;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

// ── configureManagedCollection mode ──
// Called once when user adds this plugin's collection.
// Sets up the field schema.
async function configureManagedCollection() {
  const collection = await framer.getManagedCollection();
  if (!collection) return;

  // Define fields
  for (const field of FIELDS) {
    try {
      await collection.addField({ name: field.name, type: field.type });
    } catch {
      // Field may already exist
    }
  }

  framer.showToast("Collection configured ✓");
}

// ── syncManagedCollection mode ──
// Called when user clicks "Sync" in Framer.
// Fetches articles from Supabase and upserts into the collection.
async function syncManagedCollection() {
  const collection = await framer.getManagedCollection();
  if (!collection) {
    framer.showToast("No managed collection found");
    return;
  }

  // Fetch published articles from Supabase
  const res = await fetch(`${SYNC_ENDPOINT}?status=published`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    framer.showToast(`Sync failed: ${err}`);
    return;
  }

  const { articles } = (await res.json()) as { articles: Article[] };

  if (!articles || articles.length === 0) {
    framer.showToast("No published articles to sync");
    return;
  }

  // Resolve field IDs
  const fields = await collection.getFields();
  const fieldMap = new Map(fields.map((f: any) => [f.name, f.id]));

  const titleId = fieldMap.get("Title");
  const bodyId = fieldMap.get("Body");
  const excerptId = fieldMap.get("Excerpt");
  const categoryId = fieldMap.get("Category");
  const coverId = fieldMap.get("Cover Image");
  const metaId = fieldMap.get("Meta Description");
  const dateId = fieldMap.get("Published Date");

  // Map articles to Framer items
  const items = articles.map((article) => {
    const fieldData: Record<string, any> = {};

    if (titleId) fieldData[titleId] = { type: "string", value: article.title };
    if (bodyId)
      fieldData[bodyId] = {
        type: "formattedText",
        value: article.content,
        contentType: "html",
      };
    if (excerptId) fieldData[excerptId] = { type: "string", value: article.excerpt };
    if (categoryId) fieldData[categoryId] = { type: "string", value: article.category };
    if (metaId) fieldData[metaId] = { type: "string", value: article.meta_description };
    if (dateId) fieldData[dateId] = { type: "date", value: article.created_at };
    if (coverId && article.cover_image_url && !article.cover_image_url.startsWith("data:")) {
      fieldData[coverId] = { type: "image", value: article.cover_image_url };
    }

    return {
      id: article.id, // Stable ID — re-sync updates existing items
      slug: article.slug,
      title: article.title,
      fieldData,
    };
  });

  await collection.addItems(items);

  framer.showToast(`Synced ${articles.length} article(s) ✓`);
}

// ── Entry point ──
// Framer calls us with the appropriate mode
const mode = new URLSearchParams(window.location.search).get("mode");

if (mode === "configureManagedCollection") {
  configureManagedCollection();
} else if (mode === "syncManagedCollection") {
  syncManagedCollection();
} else {
  // Default: show a simple UI
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: system-ui; text-align: center;">
      <h2>Skill Studio Blog Sync</h2>
      <p>This plugin syncs your published articles from Skill Studio AI into Framer CMS.</p>
      <p style="color: #666; font-size: 14px;">Use the CMS panel to trigger a sync.</p>
    </div>
  `;
}

export default function App() {
  return null;
}
