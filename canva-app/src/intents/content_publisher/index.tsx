import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormField,
  Rows,
  Select,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { fetchArticles, getStoredApiKey } from "../../shared/api";
import { ApiKeyLogin } from "../../shared/ApiKeyLogin";

function SettingsUi({ updatePublishSettings }: any) {
  const [apiKey, setApiKey]     = useState<string | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [platform, setPlatform] = useState("contentlab");

  useEffect(() => {
    getStoredApiKey().then((k) => {
      setApiKey(k);
      if (k) load(k);
    });
  }, []);

  async function load(key: string) {
    const data = await fetchArticles(key);
    setArticles(data);
    if (data[0]) {
      setSelectedId(data[0].id);
      push(data[0].id, "contentlab");
    }
  }

  function push(id: string, plt: string) {
    updatePublishSettings({
      isValid: !!id,
      publishTarget: { articleId: id, platform: plt },
    });
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

  return (
    <Box padding="2u">
      <Rows spacing="2u">
        <Title size="medium">Publish Design</Title>
        <FormField
          label="Destination"
          control={(props) => (
            <Select
              {...props}
              value={platform}
              options={[
                { value: "contentlab", label: "ContentLab Cover Image" },
                { value: "linkedin",   label: "LinkedIn" },
                { value: "twitter",    label: "Twitter / X" },
                { value: "instagram",  label: "Instagram" },
              ]}
              onChange={(v) => {
                setPlatform(v);
                push(selectedId, v);
              }}
            />
          )}
        />
        {platform === "contentlab" && articles.length > 0 && (
          <FormField
            label="Attach to article"
            control={(props) => (
              <Select
                {...props}
                value={selectedId}
                options={articles.map((a) => ({ value: a.id, label: a.title }))}
                onChange={(v) => {
                  setSelectedId(v);
                  push(v, platform);
                }}
              />
            )}
          />
        )}
      </Rows>
    </Box>
  );
}

export default {
  renderPublishSettingsPanel: (request: any) => <SettingsUi {...request} />,
  renderPublishPreview: () => (
    <Box padding="2u">
      <Text size="small" tone="secondary">Design preview will appear here</Text>
    </Box>
  ),
  getPublishConfiguration: async () => ({
    status: "completed",
    outputTypes: [
      {
        id: "blog_cover",
        displayName: "Blog Cover Image",
        mediaSlots: [
          {
            id: "cover",
            displayName: "Cover",
            fileCount: { exact: 1 },
            accepts: { image: { format: "png" } },
          },
        ],
      },
    ],
  }),
  publishContent: async (request: any) => {
    const apiKey = await getStoredApiKey();
    if (!apiKey) return { status: "app_error", message: "Not connected" };
    const target = request.publishTarget ?? {};
    const file   = request.exportedContent?.[0];
    if (!file?.url) return { status: "app_error", message: "No exported content" };
    try {
      const blob = await (await fetch(file.url)).blob();
      const form = new FormData();
      form.append("file", blob, "canva-design.png");
      form.append("article_id", target.articleId);
      const res = await fetch(
        "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1/upload-article-cover",
        { method: "POST", headers: { "x-api-key": apiKey }, body: form },
      );
      if (!res.ok) throw new Error("Upload failed: " + res.status);
      return {
        status: "completed",
        externalId:  target.articleId,
        externalUrl: "https://www.app.content-lab.ie/edit/" + target.articleId,
      };
    } catch (err: any) {
      return { status: "app_error", message: err.message };
    }
  },
};
