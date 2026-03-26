import React from "react";
import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import "@canva/app-ui-kit/styles.css";

import { prepareContentPublisher } from "@canva/intents/content";
import { prepareDataConnector } from "@canva/intents/data";
import { prepareDesignEditor } from "@canva/intents/design";

import contentPublisher from "./intents/content_publisher";
import dataConnector from "./intents/data_connector";
import designEditor from "./intents/design_editor";
import { App } from "./App";

// Register all intents so Canva knows this app supports them
prepareContentPublisher(contentPublisher);
prepareDataConnector(dataConnector);
prepareDesignEditor(designEditor);

// Render the main app UI in the panel
const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <AppUiProvider>
    <App />
  </AppUiProvider>,
);
