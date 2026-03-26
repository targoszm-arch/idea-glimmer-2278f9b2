import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Columns,
  Column,
  FormField,
  LoadingIndicator,
  ProgressBar,
  Rows,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { requestExport } from "@canva/design";
import { requestOpenExternalUrl } from "@canva/platform";

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
            onClick={() => requestOpenExternalUrl({ url: `${APP_URL}/signup` })}
          >
            Sign up free
          </Button>
        </Text>
      </Rows>
    </Box>
  );
}

// Upload a single blob to ContentLab, returns the public image URL
async function uploadBlob(blob: Blob, apiKey: string, title: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "canva-design.png");
  formData.append("title", title);
  const res = await fetch(`${API_BASE}/upload-article-cover`, {
    method:  "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body:    formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return data.url ?? data.public_url ?? data.image_url ?? "";
}

export function App() {
  const [apiKey, setApiKey]         = useState<string | null>(null);
  const [status, setStatus]         = useState<Status>("idle");
  const [savedUrls, setSavedUrls]   = useState<string[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });

  useEffect(() => { setApiKey(getKey()); }, []);

  async function handleSave() {
    if (!apiKey) return;
    setStatus("exporting");
    setError(null);
    setSavedUrls([]);
    setProgress({ done: 0, total: 0 });

    try {
      // Export all pages as PNG
      const result = await requestExport({ acceptedFileTypes: ["png"] });

      if (result.status !== "completed" || !result.exportBlobs?.length) {
        throw new Error("Export cancelled or no pages exported");
      }

      const blobs = result.exportBlobs;
      setStatus("uploading");
      setProgress({ done: 0, total: blobs.length });

      // Resolve all blobs first (some may be URLs not Blob objects)
      const resolvedBlobs = await Promise.all(
        blobs.map(async (entry) => {
          if (entry.blob instanceof Blob) return entry.blob;
          const r = await fetch((entry as any).url);
          return r.blob();
        })
      );

      // Upload ALL in parallel
      const urls = await Promise.all(
        resolvedBlobs.map(async (blob, i) => {
          const title = blobs.length === 1
            ? "Canva Design"
            : `Canva Design (page ${i + 1} of ${blobs.length})`;
          const url = await uploadBlob(blob, apiKey, title);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return url;
        })
      );

      setSavedUrls(urls.filter(Boolean));
      setStatus("done");
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setSavedUrls([]);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }

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
              a blog cover or social post image. Multi-page designs save all pages.
            </Text>
            <Button variant="primary" stretch onClick={handleSave}>
              Save Design to ContentLab
            </Button>
          </Rows>
        )}

        {status === "exporting" && (
          <Box padding="4u" style={{ textAlign: "center" } as any}>
            <Rows spacing="1u">
              <LoadingIndicator size="medium" />
              <Text size="small" tone="secondary">Exporting design…</Text>
            </Rows>
          </Box>
        )}

        {status === "uploading" && (
          <Box padding="3u" style={{ textAlign: "center" } as any}>
            <Rows spacing="1.5u">
              <LoadingIndicator size="medium" />
              <Text size="small" tone="secondary">
                Saving {progress.done} of {progress.total} image{progress.total !== 1 ? "s" : ""}…
              </Text>
              {progress.total > 1 && (
                <ProgressBar
                  value={progress.total > 0 ? progress.done / progress.total : 0}
                  ariaLabel="Upload progress"
                />
              )}
            </Rows>
          </Box>
        )}

        {status === "done" && (
          <Rows spacing="1.5u">
            <Box background="neutralLow" padding="2u" borderRadius="standard"
              style={{ textAlign: "center" } as any}>
              <Rows spacing="1u">
                <Text size="small" weight="bold">
                  ✓ {savedUrls.length} image{savedUrls.length !== 1 ? "s" : ""} saved!
                </Text>
                {/* Preview grid - up to 4 thumbnails */}
                {savedUrls.length > 0 && (
                  <Box style={{
                    display: "grid",
                    gridTemplateColumns: savedUrls.length === 1 ? "1fr" : "1fr 1fr",
                    gap: 6,
                  } as any}>
                    {savedUrls.slice(0, 4).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Saved design ${i + 1}`}
                        style={{
                          width: "100%",
                          borderRadius: 6,
                          aspectRatio: "1",
                          objectFit: "cover",
                        }}
                      />
                    ))}
                  </Box>
                )}
                {savedUrls.length > 4 && (
                  <Text size="xsmall" tone="secondary">
                    +{savedUrls.length - 4} more saved to your library
                  </Text>
                )}
                <Text size="xsmall" tone="secondary">
                  All designs saved to your Media Library. Attach them to any post or article.
                </Text>
              </Rows>
            </Box>
            <Button variant="primary" stretch
              onClick={() => requestOpenExternalUrl({ url: `${APP_URL}/brand` })}>
              View in Media Library →
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
