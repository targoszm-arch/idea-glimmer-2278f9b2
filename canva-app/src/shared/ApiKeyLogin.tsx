import React, { useState } from "react";
import {
  Box,
  Button,
  FormField,
  Rows,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { API_BASE, APP_URL, saveStoredApiKey } from "./api";

interface Props {
  onConnected: (apiKey: string) => void;
}

export function ApiKeyLogin({ onConnected }: Props) {
  const [key, setKey]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
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
      saveStoredApiKey(trimmed);
      onConnected(trimmed);
    } catch {
      setError("Could not connect. Check your API key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Rows spacing="2u">
      <Box paddingTop="2u">
        <img
          src="https://www.app.content-lab.ie/favicon-192.png"
          alt="ContentLab"
          style={{ width: 48, height: 48, borderRadius: 8 }}
        />
      </Box>
      <Title size="medium">Connect ContentLab</Title>
      <Text size="small" tone="secondary">
        Find your API key in ContentLab → Profile → API Key
      </Text>
      <FormField
        label="ContentLab API Key"
        error={error}
        control={(props) => (
          <TextInput
            {...props}
            placeholder="cl_xxxxxxxxxxxxxxxx"
            value={key}
            onChange={(v) => {
              setKey(v);
              setError("");
            }}
          />
        )}
      />
      <Button
        variant="primary"
        stretch
        loading={loading}
        disabled={!key.trim()}
        onClick={handleConnect}
      >
        Connect
      </Button>
      <Text size="xsmall" tone="secondary">
        Don't have an account?{" "}
        <a
          href={`${APP_URL}/signup`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#0066CC" }}
        >
          Sign up at content-lab.ie
        </a>
      </Text>
    </Rows>
  );
}
