

## ✅ Completed: Remove manual Framer credential inputs — auto-capture from plugin

### What was done

1. **Created `register-framer-plugin` edge function** — called by the Framer plugin after API key validation. Auto-captures collection ID and project name, upserts `user_integrations` row.

2. **Updated `framer-plugin/src/App.tsx`** — after `handleNext()`, calls `framer.getManagedCollection()` and `framer.getProjectInfo()` to auto-detect collection ID and project name, POSTs them to `register-framer-plugin`.

3. **Updated `src/pages/Integrations.tsx`** — removed 3 manual input fields (Project URL, API Key, Collection ID). Framer now shows "Get Plugin" button when not connected, and plugin-based connection info when connected.

4. **Simplified edge functions** — `publish-to-framer`, `delete-from-framer`, `reconcile-framer` gracefully skip when `access_token` is `"plugin-managed"` (no server-side API key available).

### Result
- Zero manual credential entry for Framer
- Plugin installation auto-registers the connection
- Integrations page shows connection status without requiring any secrets
