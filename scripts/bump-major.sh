#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (mac: brew install jq, win: choco install jq)."; exit 1
fi
[ -f manifest.json ] || { echo "manifest.json not found."; exit 1; }

OLD=$(jq -r '.version' manifest.json)
[[ "$OLD" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version '$OLD' is not MAJOR.MINOR.PATCH."; exit 1; }

IFS='.' read -r MA MI PA <<< "$OLD"
NEW="$((MA+1)).0.0"

TMP=$(mktemp)
jq --arg v "$NEW" '.version=$v' manifest.json > "$TMP" && mv "$TMP" manifest.json

git add manifest.json
git commit -m "chore: bump version to $NEW"
git tag "v$NEW"

echo "Bumped MAJOR: $OLD → $NEW"
echo "Next: git push && git push --tags"
