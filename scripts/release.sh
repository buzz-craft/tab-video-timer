#!/usr/bin/env bash
set -euo pipefail

# release.sh — bump (major/minor/patch) -> push -> package
# Usage:
#   ./scripts/release.sh             # interactive prompt
#   ./scripts/release.sh patch       # non-interactive
#   ./scripts/release.sh minor
#   ./scripts/release.sh major

die() { echo "Error: $*" >&2; exit 1; }

# Checks
command -v git >/dev/null || die "git is required"
command -v jq >/dev/null  || die "jq is required (mac: brew install jq, win: choco install jq)"

[ -f manifest.json ] || die "manifest.json not found (run from repo root)"
[ -f scripts/package.sh ] || die "scripts/package.sh missing"
[ -f scripts/bump-patch.sh ] || die "scripts/bump-patch.sh missing"
[ -f scripts/bump-minor.sh ] || die "scripts/bump-minor.sh missing"
[ -f scripts/bump-major.sh ] || die "scripts/bump-major.sh missing"

# Make sure bump scripts are executable
chmod +x scripts/bump-*.sh scripts/package.sh || true

# Warn if working tree has unstaged changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  You have uncommitted changes."
  echo "   It's recommended to commit or stash before releasing."
  read -r -p "Continue anyway? [y/N] " ans
  case "${ans:-N}" in
    y|Y) : ;;
    *) echo "Aborted."; exit 1;;
  esac
fi

# Choose bump type
CHOICE="${1:-}"
if [[ -z "$CHOICE" ]]; then
  echo "Select version bump:"
  echo "  1) patch  (x.y.Z)"
  echo "  2) minor  (x.Y.0)"
  echo "  3) major  (X.0.0)"
  read -r -p "Enter 1/2/3: " n
  case "$n" in
    1) CHOICE="patch" ;;
    2) CHOICE="minor" ;;
    3) CHOICE="major" ;;
    *) die "Invalid choice";;
  esac
fi

case "$CHOICE" in
  patch) BUMP=./scripts/bump-patch.sh ;;
  minor) BUMP=./scripts/bump-minor.sh ;;
  major) BUMP=./scripts/bump-major.sh ;;
  *) die "Unknown argument '$CHOICE' (use: patch|minor|major)";;
esac

# Current version (pre-bump)
OLD_VER=$(jq -r '.version' manifest.json)

echo "➡️  Running $BUMP ..."
$BUMP

# New version (post-bump)
NEW_VER=$(jq -r '.version' manifest.json)
echo "📦 Version: $OLD_VER -> $NEW_VER"

echo "⬆️  Pushing commits and tags ..."
git push
git push --tags

echo "🧰 Packaging ..."
./scripts/package.sh

ZIP="dist/tab-video-timer-v${NEW_VER}.zip"
if [ -f "$ZIP" ]; then
  echo "✅ Built: $ZIP"
else
  echo "⚠️  Package script ran, but $ZIP not found. Check scripts/package.sh output."
fi

echo
echo "Next steps:"
echo "  1) Open Chrome Dev Dashboard -> Upload new package"
echo "  2) Choose: $ZIP"
echo "  3) Paste 'What’s new' from CHANGELOG.md"
echo "  4) Submit"
