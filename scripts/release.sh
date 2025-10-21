#!/usr/bin/env bash
set -euo pipefail

# release.sh — one script to bump (patch/minor/major) or NO-BUMP, push, and package.
#
# Usage:
#   ./scripts/release.sh                 # interactive menu
#   ./scripts/release.sh patch           # bump x.y.Z -> x.y.(Z+1)
#   ./scripts/release.sh minor           # bump x.Y.z -> x.(Y+1).0
#   ./scripts/release.sh major           # bump X.y.z -> (X+1).0.0
#   ./scripts/release.sh nobump          # no version change; push + package
#   ./scripts/release.sh nobump --push-only  # no version change; push only (skip packaging)

die() { echo "Error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "'$1' is required"; }
need git
need jq

[ -f manifest.json ] || die "manifest.json not found (run from repo root)"
[ -f scripts/package.sh ] || die "scripts/package.sh missing"

# Parse args
choice="${1:-}"
push_only="false"
shift || true || true
for arg in "${@:-}"; do
  case "$arg" in
    --push-only) push_only="true" ;;
    *) ;;
  esac
done

# Warn on dirty tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Uncommitted changes detected."
  read -r -p "Continue anyway? [y/N] " ans
  case "${ans:-N}" in y|Y) : ;; *) echo "Aborted."; exit 1;; esac
fi

OLD_VER="$(jq -r '.version' manifest.json)"
[[ "$OLD_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "manifest.json version '$OLD_VER' is not MAJOR.MINOR.PATCH"

IFS='.' read -r MA MI PA <<< "$OLD_VER"
NEXT_PATCH="$MA.$MI.$((PA+1))"
NEXT_MINOR="$MA.$((MI+1)).0"
NEXT_MAJOR="$((MA+1)).0.0"

prompt_menu() {
  echo "Select action:"
  echo "  1) patch   ($OLD_VER -> $NEXT_PATCH)"
  echo "  2) minor   ($OLD_VER -> $NEXT_MINOR)"
  echo "  3) major   ($OLD_VER -> $NEXT_MAJOR)"
  echo "  4) NO-BUMP (keep $OLD_VER; push + package)"
  echo "     Tip: add --push-only with 'nobump' to skip packaging."
  read -r -p "Enter 1/2/3/4: " n
  case "$n" in
    1) choice="patch" ;;
    2) choice="minor" ;;
    3) choice="major" ;;
    4) choice="nobump" ;;
    *) die "Invalid choice" ;;
  esac
}

if [[ -z "$choice" ]]; then
  if [ ! -t 0 ]; then die "No TTY and no arg. Use: patch|minor|major|nobump [--push-only]"; fi
  prompt_menu
fi

# Compute NEW_VER for bump modes
case "$choice" in
  patch) NEW_VER="$NEXT_PATCH" ;;
  minor) NEW_VER="$NEXT_MINOR" ;;
  major) NEW_VER="$NEXT_MAJOR" ;;
  nobump) NEW_VER="$OLD_VER" ;;
  *) die "Unknown mode '$choice'";;
esac

# Guard: refuse only if the TAG FOR THE NEW VERSION already exists
if [[ "$choice" != "nobump" ]]; then
  if git rev-parse -q --verify "refs/tags/v$NEW_VER" >/dev/null; then
    die "Tag v$NEW_VER already exists. Refusing to bump to an existing tag."
  fi
fi

# Optional guard: avoid accidental double-bump in a single commit sequence.
last_msg="$(git log -1 --pretty=%B | tr -d '\r')"
if [[ "$choice" =~ ^(patch|minor|major)$ ]]; then
  if echo "$last_msg" | grep -Eqi '\b(bump version to|version bump|chore:\s*bump version to)\b'; then
    echo "ℹ️  Last commit looks like a bump already. Continuing anyway..."
  fi
fi

confirm() {
  local label="$1" newv="$2"
  if [ ! -t 0 ]; then return 0; fi
  read -r -p "Proceed with ${label}${newv:+ to $newv}? [y/N] " ans
  case "${ans:-N}" in y|Y) : ;; *) echo "Aborted."; exit 1;; esac
}

bump_manifest_to() {
  local v="$1"
  tmp="$(mktemp)"
  jq --arg v "$v" '.version = $v' manifest.json > "$tmp"
  mv "$tmp" manifest.json
}

do_bump() {
  local v="$1"
  bump_manifest_to "$v"
  git add manifest.json
  git commit -m "chore: bump version to $v"
  git tag "v$v"
}

# Run
case "$choice" in
  nobump)
    if [[ "$push_only" == "true" ]]; then
      echo "ℹ️  NO-BUMP + PUSH-ONLY (keep $OLD_VER; skip packaging)."
      confirm "NO-BUMP (push only)" ""
    else
      echo "ℹ️  NO-BUMP selected (keep $OLD_VER; push + package)."
      confirm "NO-BUMP (no version change)" ""
    fi
    ;;
  patch) confirm "PATCH bump" "$NEXT_PATCH"; do_bump "$NEXT_PATCH" ;;
  minor) confirm "MINOR bump" "$NEXT_MINOR"; do_bump "$NEXT_MINOR" ;;
  major) confirm "MAJOR bump" "$NEXT_MAJOR"; do_bump "$NEXT_MAJOR" ;;
esac

echo "⬆️  Pushing branch..."
git push

if [[ "$choice" != "nobump" ]]; then
  echo "⬆️  Pushing tag(s)..."
  git push --tags
fi

if [[ "$choice" == "nobump" && "$push_only" == "true" ]]; then
  echo "⏭️  Skipping packaging (push-only). Done."
  exit 0
fi

echo "🧰 Packaging..."
./scripts/package.sh || die "package.sh failed"

NEW_VER_NOW="$(jq -r '.version' manifest.json)"
ZIP="dist/tab-video-timer-v${NEW_VER_NOW}.zip"
if [ -f "$ZIP" ]; then
  echo "✅ Built: $ZIP"
else
  echo "⚠️  Expected $ZIP not found. Check package.sh output."
fi

if [[ "$choice" == "nobump" ]]; then
  echo "⚠️  Reminder: Web Store requires a higher version to accept a new upload."
fi

echo "Done."
