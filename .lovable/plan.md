

## Remove manual Framer credential inputs — auto-capture from plugin

### Why the API key was there

The edge functions (`publish-to-framer`, `delete-from-framer`, `reconcile-framer`) use the `framer-api` npm library to push/delete articles server-side. That library requires a **Project URL** and **API Token** to connect to Framer's backend via WebSocket.

However, the **Framer Plugin** already syncs articles directly using the Plugin SDK — no API key needed. The plugin calls `collection.addItems()` which works natively inside Framer.

### The problem

The Framer Plugin SDK does **not** expose the user's API token or project URL. `getProjectInfo()` returns a hashed ID that cannot be used for API access. So there is no way to auto-capture these from inside the plugin.

### Solution: Make the plugin the primary sync method, remove server-side push

Instead of requiring users to manually enter 3 credentials, we restructure so:

1. **The plugin handles all syncing** (pull articles into Framer CMS) — this already works with just the ContentLab API key
2. **Auto-capture the Collection ID** from the plugin via `getActiveManagedCollection()` and send it to the backend (for reference/display only)
3. **Remove the 3 manual input fields** (Project URL, API Key, Collection ID) from the Integrations page
4. **Mark Framer as "connected" automatically** when the plugin registers itself

### Changes

#### 1. New edge function: `register-framer-plugin`
Called by the plugin after API key validation. Receives the collection ID and project name (auto-detected). Upserts `user_integrations` row for `framer` so the Integrations page shows "Connected".

#### 2. Update `framer-plugin/src/App.tsx`
After successful API key entry in `handleNext()`:
- Call `framer.getProjectInfo()` to get project name
- Read `collection.id` from the managed collection
- POST these to `register-framer-plugin` with the user's API key for auth
- This auto-creates the integration record — no manual form needed

#### 3. Update `src/pages/Integrations.tsx`
- Remove the Framer form with 3 input fields (Project URL, API Key, Collection ID)
- Replace with a simple status card: "Install the Framer plugin to connect" with a download link
- When connected (via plugin), show the auto-detected project name and collection ID as read-only info
- Add a "Disconnect" button that removes the integration

#### 4. Simplify edge functions
- `publish-to-framer`, `delete-from-framer`, `reconcile-framer` — these server-side push functions relied on the API key. Since syncing now happens through the plugin, these become optional/deprecated. We keep them but they gracefully skip if no API key is stored (for users who previously configured them manually).

### Result
- Zero manual credential entry for Framer
- Plugin installation auto-registers the connection
- Integrations page shows connection status without requiring any secrets
- Existing server-side push still works for users who previously saved credentials

