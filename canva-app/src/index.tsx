import React from "react";
import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import { App } from "./App";
import "@canva/app-ui-kit/styles.css";

// ─── Render the main app UI ───────────────────────────────────────────────────
// This is the standard Canva app entry point.
// The Design Editor, Data Connector and Content Publisher intents
// are configured in the Canva Developer Portal and handled by the same UI.

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <AppUiProvider>
    <App />
  </AppUiProvider>
);
