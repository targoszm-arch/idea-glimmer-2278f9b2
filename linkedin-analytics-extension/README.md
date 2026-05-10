# LinkedIn Personal Analytics (independent Chrome extension)

A self-contained, no-subscription, no-backend Chrome extension that fetches
your own LinkedIn profile, posts, follower analytics, connections and
following counts — and renders them locally in the popup.

This is a clean-room reimplementation, derived from inspecting a paid
LinkedIn analytics extension's public bundle. No proprietary backend code
is included; data is fetched directly from LinkedIn's own Voyager web API
(the same endpoints linkedin.com itself uses) using the cookies of the
currently logged-in user, and stored only in `chrome.storage.local`.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and choose the `linkedin-analytics-extension` folder
4. (Optional) Add your own icons under `icons/icon16.png`, `icon48.png`,
   `icon128.png` — placeholders are referenced in the manifest.
5. Open the extension popup. If you're logged into LinkedIn, click
   **Refresh**.

## Files

- `manifest.json` — MV3 manifest, asks only for `linkedin.com` host access.
- `content.js` — runs on linkedin.com, calls Voyager GraphQL/REST endpoints
  using your `li_at` cookie + `JSESSIONID` CSRF token.
- `background.js` — service worker, opens/uses a LinkedIn tab and caches
  results in `chrome.storage.local`.
- `popup.html/.css/.js` — the local dashboard.

## Voyager endpoints used

| Data        | Endpoint                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Profile     | GraphQL `voyagerIdentityDashProfiles.34ead06db82a2cc9a778fac97f69ad6a`                            |
| Analytics   | GraphQL `voyagerFeedDashCreatorExperienceDashboard.6fcd24af6f10cdcd1cd7d8e747df3276`              |
| Posts       | GraphQL `voyagerFeedDashProfileUpdates.80d5abb3cd25edff72c093a5db696079`                          |
| Following   | GraphQL `voyagerSearchDashClusters.15c671c3162c043443995439a3d3b6dd`                              |
| Connections | REST `/voyager/api/search/dash/clusters?...resultType:CONNECTIONS`                                |

These query IDs are LinkedIn-internal and may rotate. If a request
starts returning HTTP 4xx, open the LinkedIn web app, watch the network
tab for a request to `/voyager/api/graphql`, copy the new `queryId`, and
update the constants at the top of `content.js`.

## Privacy

- No third-party network calls. Inspect `background.js` / `content.js`:
  the only host they hit is `linkedin.com`.
- Snapshot is stored in `chrome.storage.local` under the key
  `li_analytics_snapshot`. Clear it from the popup or by removing the
  extension.

## Legal note

Use only with your own LinkedIn account. LinkedIn's Terms of Service
restrict automated scraping; the same caveat that applies to the paid
extensions you may have used applies here too.

## Extending

The popup intentionally uses generic "find a number by candidate keys"
extraction so it stays robust as LinkedIn renames internal fields. To
build your own UI on top of the raw data, read the snapshot:

```js
chrome.storage.local.get("li_analytics_snapshot", (r) =>
  console.log(r.li_analytics_snapshot)
);
```

You'll find the full Voyager responses under `analytics`, `connections`,
`following`, `posts`, and the parsed `profile`.
