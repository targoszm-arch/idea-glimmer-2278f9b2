import "framer-plugin/framer.css"
import { framer } from "framer-plugin"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { syncExistingCollection } from "./sync"

// Top-level await — this runs before React mounts
// This is the exact pattern from the official Framer CMS starter
const collection = await framer.getActiveManagedCollection()

const { didSync } = await syncExistingCollection(collection)

if (didSync) {
    // Close the plugin immediately after background sync — this ends the "polling"
    framer.closePlugin("Synchronization successful", { variant: "success" })
} else {
    framer.showUI({ width: 380, height: 500 })
    const root = document.getElementById("root")
    if (!root) throw new Error("Root element not found")
    createRoot(root).render(
        <StrictMode>
            <App collection={collection} />
        </StrictMode>
    )
}
