import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Columns,
  Column,
  FormField,
  LoadingIndicator,
  Rows,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { requestExport } from "@canva/design";
import { openExternalUrl } from "@canva/platform";

const API_BASE    = "https://rnshobvpqegttrpaowxe.supabase.co/functions/v1";
const APP_URL     = "https://www.app.content-lab.ie";
const KEY_STORAGE = "contentlab_api_key";

function getKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}
function saveKey(k: string) {
  try { localStorage.setItem(KEY_STORAGE, k); } catch {}
}
function clearKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

type Status = "idle" | "exporting" | "uploading" | "done" | "error";

function LoginScreen({ onConnected }: { onConnected: (k: string) => void }) {
  const [key, setKey]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function connect() {
    const trimmed = key.trim();
    if (!trimmed.startsWith("cl_")) {
      setError("API key must start with cl_");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/framer-sync-articles`, {
        headers: { Authorization: "Bearer " + trimmed },
      });
      if (!res.ok) throw new Error("Invalid API key");
      saveKey(trimmed);
      onConnected(trimmed);
    } catch {
      setError("Could not connect. Check your API key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box padding="2u">
      <Rows spacing="2u">
        <Title size="medium">Connect ContentLab</Title>
        <Text size="small" tone="secondary">
          Find your API key in ContentLab → Profile → API Key
        </Text>
        <FormField
          label="API Key"
          error={error}
          control={(props) => (
            <TextInput
              {...props}
              placeholder="cl_xxxxxxxxxxxxxxxx"
              value={key}
              onChange={(v) => { setKey(v); setError(""); }}
            />
          )}
        />
        <Button
          variant="primary"
          stretch
          loading={loading}
          disabled={!key.trim()}
          onClick={connect}
        >
          Connect
        </Button>
        <Text size="xsmall" tone="secondary">
          No account?{" "}
          <Button
            variant="tertiary"
            size="small"
            onClick={() => openExternalUrl({ url: `${APP_URL}/signup` })}
          >
            Sign up free
          </Button>
        </Text>
      </Rows>
    </Box>
  );
}

export function App() {
  const [apiKey, setApiKey]     = useState<string | null>(null);
  const [status, setStatus]     = useState<Status>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => { setApiKey(getKey()); }, []);

  async function handleSave() {
    if (!apiKey) return;
    setStatus("exporting");
    setError(null);
    try {
      const result = await requestExport({ acceptedFileTypes: ["png"] });
      if (result.status !== "completed" || !result.exportBlobs?.[0]) {
        throw new Error("Export cancelled");
      }
      setStatus("uploading");
      const blob     = result.exportBlobs[0].blob;
      const formData = new FormData();
      formData.append("file", blob, "canva-design.png");
      const res = await fetch(`${API_BASE}/upload-article-cover`, {
        method:  "POST",
        headers: { Authorization: "Bearer " + apiKey },
        body:    formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setImageUrl(data.url ?? data.public_url ?? data.image_url ?? "");
      setStatus("done");
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setStatus("error");
    }
  }

  function reset() { setStatus("idle"); setImageUrl(null); setError(null); }

  if (!apiKey) return <LoginScreen onConnected={(k) => setApiKey(k)} />;

  return (
    <Box padding="2u">
      <Rows spacing="2u">
        <Columns spacing="1u" alignY="center">
          <Column>
            <Title size="small">Save to ContentLab</Title>
          </Column>
          <Column width="content">
            <Button variant="tertiary" size="small"
              onClick={() => { clearKey(); setApiKey(null); }}>
              Disconnect
            </Button>
          </Column>
        </Columns>

        {status === "idle" && (
          <Rows spacing="1u">
            <Text size="small" tone="secondary">
              Design your graphic in Canva, then save it to ContentLab to use as
              a blog cover or social post image.
            </Text>
            <Button variant="primary" stretch onClick={handleSave}>
              Save Design to ContentLab
            </Button>
          </Rows>
        )}

        {(status === "exporting" || status === "uploading") && (
          <Box padding="4u" style={{ textAlign: "center" } as any}>
            <Rows spacing="1u">
              <LoadingIndicator size="medium" />
              <Text size="small" tone="secondary">
                {status === "exporting" ? "Exporting design…" : "Saving to ContentLab…"}
              </Text>
            </Rows>
          </Box>
        )}

        {status === "done" && (
          <Rows spacing="1.5u">
            <Box background="neutralLow" padding="2u" borderRadius="standard"
              style={{ textAlign: "center" } as any}>
              <Rows spacing="1u">
                <Text size="small" weight="bold">✓ Design saved!</Text>
                {imageUrl && (
                  <img src={imageUrl} alt="Saved design"
                    style={{ width: "100%", borderRadius: 6, maxHeight: 200, objectFit: "cover" }} />
                )}
                <Text size="xsmall" tone="secondary">
                  Go to ContentLab to attach this design to a blog post or social post.
                </Text>
              </Rows>
            </Box>
            <Button variant="primary" stretch
              onClick={() => openExternalUrl({ url: `${APP_URL}/social` })}>
              Go to ContentLab →
            </Button>
            <Button variant="secondary" stretch onClick={reset}>
              Save Another Design
            </Button>
          </Rows>
        )}

        {status === "error" && (
          <Rows spacing="1u">
            <Box background="neutralLow" padding="1.5u" borderRadius="standard">
              <Text size="small" tone="secondary">❌ {error}</Text>
            </Box>
            <Button variant="secondary" stretch onClick={reset}>Try Again</Button>
          </Rows>
        )}
      </Rows>
    </Box>
  );
}
