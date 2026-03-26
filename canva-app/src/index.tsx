import React from "react";
import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import "@canva/app-ui-kit/styles.css";

import { prepareContentPublisher } from "@canva/intents/content";
import { prepareDesignEditor } from "@canva/intents/design";

import contentPublisher from "./intents/content_publisher";
import designEditor from "./intents/design_editor";
import { App } from "./App";

// Register intents
prepareContentPublisher(contentPublisher);
prepareDesignEditor(designEditor);

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <AppUiProvider>
    <App />
  </AppUiProvider>,
);
