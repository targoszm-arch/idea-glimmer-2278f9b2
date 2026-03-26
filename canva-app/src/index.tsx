import React from "react";
import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import { App } from "./App";
import "@canva/app-ui-kit/styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <AppUiProvider>
    <App />
  </AppUiProvider>,
);
