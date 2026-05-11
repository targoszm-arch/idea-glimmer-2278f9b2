#!/usr/bin/env bash
# Bundles the LinkedIn browser extension from ~/linkedin-analytics-extension
# into public/linkedin-analytics-extension.zip so users can download it from
# Settings → Integrations. Run after any change to the extension source.
set -euo pipefail

SRC="${HOME}/linkedin-analytics-extension"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public"
OUT="${OUT_DIR}/linkedin-analytics-extension.zip"

if [ ! -d "$SRC" ]; then
  echo "ERROR: extension source not found at $SRC" >&2
  exit 1
fi

cd "$SRC"
rm -f "$OUT"
zip -r "$OUT" \
  manifest.json background.js content.js contentlab-bridge.js \
  options.html options.js popup.html popup.js popup.css \
  icons/ README.md \
  >/dev/null

VERSION=$(grep '"version"' manifest.json | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/')
SIZE=$(ls -lh "$OUT" | awk '{print $5}')
echo "✓ Packed v${VERSION} → ${OUT} (${SIZE})"
