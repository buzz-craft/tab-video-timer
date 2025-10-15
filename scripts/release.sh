#!/usr/bin/env bash
set -euo pipefail

# release.sh — bump (major/minor/patch) or NO-BUMP -> push -> package
# Usage:
#   ./scripts/release.sh              # interactive prompt
#   ./scripts/release.sh patch        # non-interactive
#   ./scripts/release.sh minor
#   ./scripts/release.sh major
#   ./scripts/release.sh nobump       # no version change; push + package only

die() { echo "Error: $*" >&2; exit 1; }

command -v git >/dev/null || die "git is required"
command -v jq  >/dev/null || die "jq is required (mac: brew install jq, win: choco install jq)"

[ -f manifest.json ]                 || die "manifest.json not found (run from repo root)"
[ -f scripts/package.sh ]            || die "scripts/package.sh missing"
[ -f scripts/bump-patch.sh ]         || die "scripts/bump-patch.sh missing"
[ -f scripts/bump-minor.sh ]         || die "scripts/bump-minor.sh missing"
[ -f scripts/bump-major.sh ]         || die "scripts/bump-major.sh missing"

chmod +x scripts/bump-*.sh scripts/package.sh || true

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Uncommitted changes detected."
  read -r -p "Continue anyway? [y/N] " ans
  case "${ans:-N}" in y|Y) : ;; *) echo "Aborted."; exit 1;; esac
fi

CHOICE="${1:-}"
if [[ -z "$CHOICE" ]]; then
  echo "Select action:"
  echo "  1) patch  (x.y.Z)"
  echo "  2) minor  (x.Y.0)"
  echo "  3) major  (X.0.0)"
  echo "  4) NO BUMP (keep version; push + package)"
  read -r -p "Enter 1/2/3/4: " n
  case "$n" in
    1) CHOICE="patch" ;;
    2) CHOICE="minor" ;;
    3) CHOICE="major" ;;
    4) CHOICE="nobump" ;;
    *) die "Invalid choice";;
  esac
fi

OLD_VER=$(jq -r '.version' manifest.json)
NEW_VER="$OLD_VER"

if [[ "$CHOICE" == "nobump" ]]; then
  echo "ℹ️  NO-BUMP mode selected: version stays at $OLD_VER"
else
  case "$CHOICE" in
    patch) BUMP=./scripts/bump-patch.sh ;;
    minor) BUMP=./scripts/bump-minor.sh ;;
    major) BUMP=./scripts/bump-major.sh ;;
    *) die "Unknown argument '$CHOICE' (use: patch|minor|major|nobump)";;
  esac

  echo "➡️  Running $BUMP ..."
  $BUMP
  NEW_VER=$(jq -r '.version' manifest.json)
  echo "📦 Version: $OLD_VER -> $NEW_VER"
fi

echo "⬆️  Pushing commits..."
git push

if [[ "$CHOICE" != "nobump" ]]; then
  echo "⬆️  Pushing tags..."
  git push --tags
else
  echo "⏭️  Skipping tag push (no-bump mode)."
fi

echo "🧰 Packaging ..."
./scripts/package.sh

ZIP="dist/tab-video-timer-v${NEW_VER}.zip"
if [ -f "$ZIP" ]; then
  echo "✅ Built: $ZIP"
else
  echo "⚠️  Package script ran, but $ZIP not found. Check scripts/package.sh output."
fi

if [[ "$CHOICE" == "nobump" ]]; then
  echo
  echo "⚠️  Reminder: Chrome Web Store requires a higher manifest version to accept a new upload."
  echo "    Use this ZIP for local testing or GitHub artifacts only."
fi

echo
echo "Next steps:"
echo "  1) For Web Store upload, ensure version increased (not applicable to no-bump)."
echo "  2) Open Dev Dashboard -> Upload new package"
echo "  3) Choose: $ZIP"
echo "  4) Paste 'What’s new' from CHANGELOG.md"
echo "  5) Submit"
