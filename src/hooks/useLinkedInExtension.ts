import { useCallback, useEffect, useState } from "react";

type RefreshResult = {
  ok: boolean;
  profile?: { ok: boolean; error?: string; sync?: any };
  companies?: { ok: boolean; error?: string; sync?: any };
  error?: string;
};

// Detects whether the LinkedIn Browser Extension's content script is loaded
// on this page, and exposes a `refresh()` that triggers an in-extension data
// pull + push back to ContentLab.
export function useLinkedInExtension() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Listen for the bridge's auto-announce + ping replies.
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (!m || m.source !== "contentlab-extension") return;
      if (m.type === "available" || m.type === "ping:pong") {
        setAvailable(true);
        if (m.version) setVersion(m.version);
      }
    };
    window.addEventListener("message", onMessage);

    // Active probe: send a ping; if no response in 600ms assume not installed.
    window.postMessage({ source: "contentlab", type: "ping" }, "*");
    const t = setTimeout(() => setAvailable((v) => (v === null ? false : v)), 600);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(t);
    };
  }, []);

  const refresh = useCallback((): Promise<RefreshResult> => {
    return new Promise((resolve) => {
      if (available === false) {
        resolve({ ok: false, error: "Extension not detected" });
        return;
      }
      setRefreshing(true);
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onResp);
        setRefreshing(false);
        resolve({ ok: false, error: "Extension did not respond in 60s" });
      }, 60000);
      const onResp = (e: MessageEvent) => {
        const m = e.data;
        if (!m || m.source !== "contentlab-extension" || m.type !== "refresh-linkedin:done") return;
        clearTimeout(timeout);
        window.removeEventListener("message", onResp);
        setRefreshing(false);
        const ok = !!(m.profile?.ok || m.companies?.ok);
        resolve({ ok, profile: m.profile, companies: m.companies });
      };
      window.addEventListener("message", onResp);
      window.postMessage({ source: "contentlab", type: "refresh-linkedin" }, "*");
    });
  }, [available]);

  return { available, version, refresh, refreshing };
}
