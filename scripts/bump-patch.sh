#!/usr/bin/env bash
set -euo pipefail

# Requires: jq (mac: `brew install jq`, windows: `choco install jq`)
OLD=$(jq -r '.version' manifest.json)
IFS='.' read -r MA MI PA <<< "$OLD"
NEW="$MA.$MI.$((PA+1))"

TMP=$(mktemp)
jq --arg v "$NEW" '.version=$v' manifest.json > "$TMP" && mv "$TMP" manifest.json

git add manifest.json
git commit -m "chore: bump version to $NEW"
git tag "v$NEW"

echo "Bumped to $NEW"
echo "Next: git push && git push --tags"
