import React from "react"
import ReactDOM from "react-dom/client"
import { framer } from "framer-plugin"
import App from "./App"
import { configureManagedCollection, syncManagedCollection } from "./App"

const mode = framer.mode

if (mode === "syncManagedCollection") {
  // Silent background sync — no UI needed, just run and done
  syncManagedCollection()
} else if (mode === "configureManagedCollection") {
  // Show configuration UI
  framer.showUI({ width: 300, height: 400 })
  configureManagedCollection().then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode><App /></React.StrictMode>
    )
  })
} else {
  // Canvas mode — show full UI
  framer.showUI({ width: 300, height: 400 })
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode><App /></React.StrictMode>
  )
}
