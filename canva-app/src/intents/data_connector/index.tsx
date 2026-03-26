import React, { useEffect, useState } from "react";
import { Box, Button, Rows, Text, Title } from "@canva/app-ui-kit";
import { fetchArticles, getStoredApiKey } from "../../shared/api";
import { ApiKeyLogin } from "../../shared/ApiKeyLogin";

function SelectionUi({ updateDataRef }: any) {
  const [apiKey, setApiKey]     = useState<string | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    getStoredApiKey().then((k) => {
      setApiKey(k);
      if (k) load(k);
      else setLoading(false);
    });
  }, []);

  async function load(key: string) {
    setLoading(true);
    try {
      setArticles(await fetchArticles(key));
    } finally {
      setLoading(false);
    }
  }

  if (!apiKey)
    return (
      <Box padding="2u">
        <ApiKeyLogin
          onConnected={(k) => {
            setApiKey(k);
            load(k);
          }}
        />
      </Box>
    );

  return (
    <Box padding="2u">
      <Rows spacing="2u">
        <Title size="medium">Import Articles</Title>
        {loading ? (
          <Text size="small" tone="secondary">
            Loading…
          </Text>
        ) : (
          <>
            <Text size="small" tone="secondary">
              {articles.length} articles available from ContentLab
            </Text>
            <Button
              variant="primary"
              stretch
              loading={importing}
              onClick={async () => {
                setImporting(true);
                await updateDataRef({
                  type: "DATA_TABLE",
                  dataRef: { apiKey, category: "all" },
                });
                setImporting(false);
              }}
            >
              Import {articles.length} Articles
            </Button>
          </>
        )}
      </Rows>
    </Box>
  );
}

async function getDataTable(request: any) {
  try {
    const articles = await fetchArticles(request.dataRef?.apiKey);
    return {
      status: "completed",
      dataTable: {
        columns: [
          { id: "title",       name: "Title",          type: "string" },
          { id: "excerpt",     name: "Excerpt",         type: "string" },
          { id: "category",    name: "Category",        type: "string" },
          { id: "cover_image", name: "Cover Image URL", type: "string" },
          { id: "author",      name: "Author",          type: "string" },
          { id: "url",         name: "Article URL",     type: "string" },
        ],
        rows: articles.map((a: any) => ({
          cells: {
            title:       { type: "string", value: a.title ?? "" },
            excerpt:     { type: "string", value: a.excerpt ?? "" },
            category:    { type: "string", value: a.category ?? "" },
            cover_image: { type: "string", value: a.cover_image_url ?? "" },
            author:      { type: "string", value: a.author_name ?? "" },
            url:         { type: "string", value: `https://www.app.content-lab.ie/article/${a.id}` },
          },
        })),
      },
      metadata: {
        description:  "ContentLab articles",
        providerInfo: { name: "ContentLab" },
      },
    };
  } catch (err: any) {
    return { status: "app_error", message: err.message };
  }
}

export default {
  renderSelectionUi: (request: any) => {
    const { createRoot }    = require("react-dom/client");
    const { AppUiProvider } = require("@canva/app-ui-kit");
    createRoot(document.getElementById("root")!).render(
      <AppUiProvider>
        <SelectionUi {...request} />
      </AppUiProvider>,
    );
  },
  getDataTable,
};
