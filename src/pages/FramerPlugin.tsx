import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SYNC_ENDPOINT = `${SUPABASE_URL}/functions/v1/framer-sync-articles`;

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
};

/**
 * This page is loaded inside Framer as a Development Plugin.
 * It uses the framer-plugin SDK (loaded from Framer's environment)
 * to sync articles from Supabase into a Managed Collection.
 */
const FramerPlugin = () => {
  const [status, setStatus] = useState<"idle" | "configuring" | "syncing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [articleCount, setArticleCount] = useState(0);

  // Detect mode from URL params (Framer passes ?mode=...)
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  useEffect(() => {
    if (mode === "configureManagedCollection") {
      handleConfigure();
    } else if (mode === "syncManagedCollection") {
      handleSync();
    }
  }, [mode]);

  const handleConfigure = async () => {
    setStatus("configuring");
    try {
      // @ts-ignore - framer is injected by the Framer plugin environment
      const framer = window.framer || (await import("framer-plugin")).framer;
      const collection = await framer.getManagedCollection();
      if (!collection) {
        setStatus("error");
        setMessage("No managed collection found");
        return;
      }

      const fields = [
        { name: "Title", type: "string" },
        { name: "Body", type: "formattedText" },
        { name: "Excerpt", type: "string" },
        { name: "Category", type: "string" },
        { name: "Cover Image", type: "image" },
        { name: "Meta Description", type: "string" },
        { name: "Published Date", type: "date" },
      ];

      for (const field of fields) {
        try {
          await collection.addField(field);
        } catch {
          // Field already exists
        }
      }

      framer.showToast("Collection configured ✓");
      setStatus("done");
      setMessage("Collection fields configured successfully!");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Configuration failed");
    }
  };

  const handleSync = async () => {
    setStatus("syncing");
    setMessage("Fetching published articles...");

    try {
      // Fetch articles from Supabase
      const res = await fetch(`${SYNC_ENDPOINT}?status=published`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const { articles } = await res.json();

      if (!articles || articles.length === 0) {
        setStatus("done");
        setMessage("No published articles to sync.");
        return;
      }

      setMessage(`Found ${articles.length} articles. Pushing to Framer...`);

      // @ts-ignore - framer is injected by the Framer plugin environment
      const framer = window.framer || (await import("framer-plugin")).framer;
      const collection = await framer.getManagedCollection();

      if (!collection) {
        setStatus("error");
        setMessage("No managed collection found. Configure the plugin first.");
        return;
      }

      const fields = await collection.getFields();
      const fieldMap = new Map<string, string>(fields.map((f: any) => [f.name, f.id]));

      const titleId = fieldMap.get("Title");
      const bodyId = fieldMap.get("Body");
      const excerptId = fieldMap.get("Excerpt");
      const categoryId = fieldMap.get("Category");
      const coverId = fieldMap.get("Cover Image");
      const metaId = fieldMap.get("Meta Description");
      const dateId = fieldMap.get("Published Date");

      const items = articles.map((article: Article) => {
        const fieldData: Record<string, any> = {};

        if (titleId) fieldData[titleId] = { type: "string", value: article.title };
        if (bodyId) fieldData[bodyId] = { type: "formattedText", value: article.content, contentType: "html" };
        if (excerptId) fieldData[excerptId] = { type: "string", value: article.excerpt };
        if (categoryId) fieldData[categoryId] = { type: "string", value: article.category };
        if (metaId) fieldData[metaId] = { type: "string", value: article.meta_description };
        if (dateId) fieldData[dateId] = { type: "date", value: article.created_at };
        if (coverId && article.cover_image_url && !article.cover_image_url.startsWith("data:")) {
          fieldData[coverId] = { type: "image", value: article.cover_image_url };
        }

        return {
          id: article.id,
          slug: article.slug,
          title: article.title,
          fieldData,
        };
      });

      await collection.addItems(items);

      setArticleCount(articles.length);
      setStatus("done");
      setMessage(`Successfully synced ${articles.length} article(s) to Framer!`);
      framer.showToast(`Synced ${articles.length} article(s) ✓`);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Sync failed");
    }
  };

  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "24px",
      maxWidth: "400px",
      margin: "0 auto",
      textAlign: "center",
      color: "#1a1a1a",
    }}>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px" }}>
          ✨ Skill Studio Blog Sync
        </h2>
        <p style={{ fontSize: "13px", color: "#666", margin: 0 }}>
          Sync published articles from Supabase → Framer CMS
        </p>
      </div>

      {status === "idle" && !mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={handleSync}
            style={{
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              background: "#0066FF",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            🔄 Sync Articles Now
          </button>
          <p style={{ fontSize: "12px", color: "#999" }}>
            This will fetch all published articles and push them into your Framer collection.
          </p>
        </div>
      )}

      {status === "configuring" && (
        <p style={{ fontSize: "14px", color: "#0066FF" }}>⚙️ Setting up collection fields...</p>
      )}

      {status === "syncing" && (
        <p style={{ fontSize: "14px", color: "#0066FF" }}>🔄 {message}</p>
      )}

      {status === "done" && (
        <div>
          <p style={{ fontSize: "14px", color: "#00AA55", fontWeight: 600 }}>✅ {message}</p>
          {articleCount > 0 && (
            <button
              onClick={handleSync}
              style={{
                marginTop: "16px",
                padding: "10px 16px",
                fontSize: "13px",
                background: "#f0f0f0",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Sync Again
            </button>
          )}
        </div>
      )}

      {status === "error" && (
        <div>
          <p style={{ fontSize: "14px", color: "#DD3333" }}>❌ {message}</p>
          <button
            onClick={() => { setStatus("idle"); setMessage(""); }}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              fontSize: "13px",
              background: "#f0f0f0",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default FramerPlugin;
