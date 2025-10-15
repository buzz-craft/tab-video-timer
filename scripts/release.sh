#!/usr/bin/env bash
set -euo pipefail

# release.sh — bump (patch/minor/major) or NO-BUMP -> push -> (optional) package
#
# Usage:
#   ./scripts/release.sh                    # interactive menu + confirmation
#   ./scripts/release.sh patch              # bump x.y.Z -> x.y.(Z+1)
#   ./scripts/release.sh minor              # bump x.Y.z -> x.(Y+1).0
#   ./scripts/release.sh major              # bump X.y.z -> (X+1).0.0
#   ./scripts/release.sh nobump             # no version change; push + package
#   ./scripts/release.sh nobump --push-only # no version change; push only (skip packaging)
#
# Safeguards:
#   • If no arg and interactive TTY, show a menu and ask for confirmation.
#   • If not interactive and no arg, abort.
#   • If the last commit message looks like a version bump, refuse to bump again.
#   • If the latest tag equals the manifest version, refuse to bump again.

die() { echo "Error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "'$1' is required (mac: brew install $1, win: choco install $1)"; }
need git
need jq

[ -f manifest.json ]                 || die "manifest.json not found (run from repo root)"
[ -f scripts/package.sh ]            || die "scripts/package.sh missing"
[ -f scripts/bump-patch.sh ]         || die "scripts/bump-patch.sh missing"
[ -f scripts/bump-minor.sh ]         || die "scripts/bump-minor.sh missing"
[ -f scripts/bump-major.sh ]         || die "scripts/bump-major.sh missing"

chmod +x scripts/bump-*.sh scripts/package.sh || true

# Parse args (support --push-only in any position)
choice=""
push_only="false"
for arg in "${@:-}"; do
  case "$arg" in
    patch|minor|major|nobump) choice="$arg" ;;
    --push-only) push_only="true" ;;
    *) ;;
  esac
done

# Warn if working tree has unstaged/staged changes
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

# If no arg provided, enforce interactive TTY
if [[ -z "$choice" ]]; then
  if [ ! -t 0 ]; then
    die "No TTY detected and no argument provided. Use: patch | minor | major | nobump [--push-only]"
  fi
  echo "Select action:"
  echo "  1) patch   ($OLD_VER -> $NEXT_PATCH)"
  echo "  2) minor   ($OLD_VER -> $NEXT_MINOR)"
  echo "  3) major   ($OLD_VER -> $NEXT_MAJOR)"
  echo "  4) NO-BUMP (keep $OLD_VER; push + package)"
  echo "     Tip: You can add --push-only with 'nobump' to skip packaging."
  read -r -p "Enter 1/2/3/4: " n
  case "$n" in
    1) choice="patch" ;;
    2) choice="minor" ;;
    3) choice="major" ;;
    4) choice="nobump" ;;
    *) die "Invalid choice";;
  esac
fi

# ----- Double-bump guards -----
last_msg="$(git log -1 --pretty=%B | tr -d '\r')"
if [[ "$choice" =~ ^(patch|minor|major)$ ]]; then
  # Guard A: last commit already looks like a bump
  if echo "$last_msg" | grep -Eqi '\b(bump version to|version bump|chore:\s*bump version to)\b'; then
    die "Last commit looks like a bump already. Refusing to bump again. (Use 'nobump' or make another commit first.)"
  fi
  # Guard B: latest tag equals manifest version
  latest_tag="$(git tag --list 'v*' --sort=-version:refname | head -n1 || true)"
  latest_tag="${latest_tag#v}"
  if [[ -n "$latest_tag" && "$latest_tag" == "$OLD_VER" ]]; then
    die "Latest tag 'v${latest_tag}' already equals manifest version ${OLD_VER}. Refusing to bump again."
  fi
fi

confirm() {
  local label="$1" newv="$2"
  if [ ! -t 0 ]; then return 0; fi  # non-interactive: skip confirm
  read -r -p "Proceed with ${label}${newv:+ to $newv}? [y/N] " ans
  case "${ans:-N}" in y|Y) : ;; *) echo "Aborted."; exit 1;; esac
}

case "$choice" in
  nobump)
    if [[ "$push_only" == "true" ]]; then
      echo "ℹ️  NO-BUMP + PUSH-ONLY selected (keep $OLD_VER; skip packaging)."
      confirm "NO-BUMP (push only)" ""
    else
      echo "ℹ️  NO-BUMP selected (keep $OLD_VER; push + package)."
      confirm "NO-BUMP (no version change)" ""
    fi
    ;;

  patch)
    confirm "PATCH bump" "$NEXT_PATCH"
    echo "➡️  Running patch bump ..."
    ./scripts/bump-patch.sh
    ;;

  minor)
    confirm "MINOR bump" "$NEXT_MINOR"
    echo "➡️  Running minor bump ..."
    ./scripts/bump-minor.sh
    ;;

  major)
    confirm "MAJOR bump" "$NEXT_MAJOR"
    echo "➡️  Running major bump ..."
    ./scripts/bump-major.sh
    ;;

  *)
    die "Unknown argument '$choice' (use: patch | minor | major | nobump [--push-only])"
    ;;
esac

NEW_VER="$(jq -r '.version' manifest.json)"

echo "⬆️  Pushing commits..."
git push

if [[ "$choice" != "nobump" ]]; then
  echo "⬆️  Pushing tags..."
  git push --tags
else
  echo "⏭️  Skipping tag push (no-bump mode)."
fi

if [[ "$choice" == "nobump" && "$push_only" == "true" ]]; then
  echo "⏭️  Skipping packaging (push-only mode)."
  echo
  echo "Reminder: Web Store requires a higher version to accept a new upload."
  exit 0
fi

echo "🧰 Packaging ..."
./scripts/package.sh

ZIP="dist/tab-video-timer-v${NEW_VER}.zip"
if [ -f "$ZIP" ]; then
  echo "✅ Built: $ZIP"
else
  echo "⚠️  Package script ran, but $ZIP not found. Check scripts/package.sh output."
fi

if [[ "$choice" == "nobump" ]]; then
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
