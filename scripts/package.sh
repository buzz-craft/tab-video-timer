#!/usr/bin/env bash
set -euo pipefail

# Requires: jq (mac: `brew install jq`, windows: use Git Bash + `choco install jq`)
NAME="tab-video-timer"
VERSION=$(jq -r '.version' manifest.json 2>/dev/null || echo "0.0.0")
OUT="dist/${NAME}-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# List all files that ship to users:
zip -r "$OUT" \
  manifest.json \
  background.js \
  content.js \
  popup.html popup.js popup.css \
  options.html options.js options.css \
  icon16.png icon48.png icon128.png \
  -x "dist/*" ".git/*"

echo "Built $OUT"
