

## Plan: Add Logo to Framer Plugin

### What
Copy the uploaded logo into the Framer plugin's public folder and display it in the plugin UI (the `index.html` that gets bundled into the ZIP).

### How

1. **Copy the logo file** from `user-uploads://SS_AI_logo_1.png` to `public/framer-plugin/logo.png` — this ensures it's included in the built ZIP alongside `index.html` and `framer.json`.

2. **Update `public/framer-plugin/index.html`** — Add an `<img>` tag above the `<h1>` to display the logo:
   - `<img src="./logo.png" alt="Skill Studio" style="width:48px; height:48px; border-radius:12px; margin-bottom:8px;" />`
   - This uses a relative path (`./logo.png`) so it resolves correctly inside the Framer plugin context.

Two files touched: one asset copy, one small HTML edit.

