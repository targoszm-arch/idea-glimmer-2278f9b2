import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Rows,
  Select,
  Text,
  Title,
  TextInput,
  FormField,
  Badge,
  LoadingIndicator,
  Columns,
  Column,
} from "@canva/app-ui-kit";
import { addElementAtPoint, createRichtextRange } from "@canva/design";
import { openExternalUrl } from "@canva/platform";
import { upload } from "@canva/asset";
import type {
  DesignEditorIntent,
  RenderAppUiRequest,
} from "@canva/intents/design";
import {
  fetchArticles,
  getStoredApiKey,
  clearStoredApiKey,
  type Article,
} from "../../shared/api";
import { ApiKeyLogin } from "../../shared/ApiKeyLogin";

type Tab = "articles" | "publish";

function App() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("articles");
  const [search, setSearch] = useState("");
  const [inserting, setInserting] = useState<string | null>(null);

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
      const data = await fetchArticles(key);
      setArticles(data);
    } finally {
      setLoading(false);
    }
  }

  async function insertText(article: Article) {
    setInserting(article.id);
    try {
      const titleRange = createRichtextRange();
      titleRange.appendText(article.title, {
        fontSize: 32,
        fontWeight: "bold",
      });
      await addElementAtPoint({ type: "richtext", richtext: titleRange });

      if (article.excerpt) {
        const excerptRange = createRichtextRange();
        excerptRange.appendText(article.excerpt, { fontSize: 16 });
        await addElementAtPoint({ type: "richtext", richtext: excerptRange });
      }
    } catch (err) {
      console.error("Failed to insert text:", err);
    } finally {
      setInserting(null);
    }
  }

  async function insertImage(article: Article) {
    if (!article.cover_image_url) return;
    setInserting(article.id + "_img");
    try {
      const asset = await upload({
        type: "image",
        mimeType: "image/jpeg",
        url: article.cover_image_url,
        thumbnailUrl: article.cover_image_url,
      });
      await addElementAtPoint({ type: "image", ref: asset.ref });
    } catch (err) {
      console.error("Failed to insert image:", err);
    } finally {
      setInserting(null);
    }
  }

  if (!apiKey) {
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
  }

  const filtered = articles.filter(
    (a) =>
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.category ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box padding="1u">
      <Rows spacing="1u">
        <Box>
          <Columns spacing="1u" alignY="center">
            <Column>
              <img
                src="https://www.app.content-lab.ie/favicon-32.png"
                alt="ContentLab"
                style={{ width: 24, height: 24, borderRadius: 4 }}
              />
            </Column>
            <Column>
              <Title size="small">ContentLab</Title>
            </Column>
            <Column width="content">
              <Button
                variant="tertiary"
                size="small"
                onClick={() => {
                  clearStoredApiKey();
                  setApiKey(null);
                }}
              >
                Disconnect
              </Button>
            </Column>
          </Columns>
        </Box>

        <Box style={{ display: "flex", gap: 4 } as any}>
          {(["articles", "publish"] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "secondary" : "tertiary"}
              size="small"
              onClick={() => setTab(t)}
            >
              {t === "articles" ? "📄 Articles" : "📤 Publish"}
            </Button>
          ))}
        </Box>

        {tab === "articles" && (
          <>
            <FormField
              label=""
              control={(props) => (
                <TextInput
                  {...props}
                  placeholder="Search articles…"
                  value={search}
                  onChange={setSearch}
                />
              )}
            />
            {loading ? (
              <Box padding="4u" style={{ textAlign: "center" } as any}>
                <LoadingIndicator size="medium" />
              </Box>
            ) : (
              <Box style={{ maxHeight: 480, overflowY: "auto" } as any}>
                <Rows spacing="1u">
                  {filtered.map((a) => (
                    <Box
                      key={a.id}
                      background="surface"
                      padding="1.5u"
                      borderRadius="standard"
                      style={{ border: "1px solid #e5e7eb" } as any}
                    >
                      <Rows spacing="0.5u">
                        {a.cover_image_url && (
                          <img
                            src={a.cover_image_url}
                            alt={a.title}
                            style={{
                              width: "100%",
                              height: 80,
                              objectFit: "cover",
                              borderRadius: 4,
                            }}
                          />
                        )}
                        <Text size="small" weight="bold" lineClamp={2}>
                          {a.title}
                        </Text>
                        <Box style={{ display: "flex", gap: 6 } as any}>
                          {a.category && (
                            <Badge tone="info">{a.category}</Badge>
                          )}
                          {a.reading_time_minutes && (
                            <Text size="xsmall" tone="secondary">
                              {a.reading_time_minutes} min
                            </Text>
                          )}
                        </Box>
                        <Columns spacing="1u">
                          <Column>
                            <Button
                              variant="secondary"
                              size="small"
                              stretch
                              loading={inserting === a.id}
                              onClick={() => insertText(a)}
                            >
                              Add Text
                            </Button>
                          </Column>
                          {a.cover_image_url && (
                            <Column>
                              <Button
                                variant="secondary"
                                size="small"
                                stretch
                                loading={inserting === a.id + "_img"}
                                onClick={() => insertImage(a)}
                              >
                                Add Image
                              </Button>
                            </Column>
                          )}
                        </Columns>
                      </Rows>
                    </Box>
                  ))}
                  {filtered.length === 0 && (
                    <Text size="small" tone="secondary">
                      No articles found
                    </Text>
                  )}
                </Rows>
              </Box>
            )}
          </>
        )}

        {tab === "publish" && (
          <Box padding="2u" background="neutralLow" borderRadius="standard">
            <Rows spacing="1u">
              <Text size="small" weight="bold">
                Publish your design
              </Text>
              <Text size="small" tone="secondary">
                Use the <strong>Share → Publish</strong> button in Canva to
                publish this design directly to ContentLab as a cover image or
                social media post.
              </Text>
              <Button
                variant="primary"
                stretch
                onClick={() =>
                  openExternalUrl({ url: "https://www.app.content-lab.ie/dashboard" })
                }
              >
                Open ContentLab →
              </Button>
            </Rows>
          </Box>
        )}
      </Rows>
    </Box>
  );
}

const designEditor: DesignEditorIntent = {
  renderAppUi: (_request: RenderAppUiRequest) => {
    const { createRoot } = require("react-dom/client");
    const { AppUiProvider } = require("@canva/app-ui-kit");
    const root = createRoot(document.getElementById("root")!);
    root.render(
      <AppUiProvider>
        <App />
      </AppUiProvider>,
    );
  },
};

export default designEditor;
