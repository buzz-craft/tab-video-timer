# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 1.1.1 — 2025-10-21
### Fixed
- **Service worker crash**: `background.js` tail listener had a truncated line causing
  “Service worker registration failed (code 15)”. Replaced with a complete,
  safe `tabs.onUpdated`/`tabs.onRemoved` pair for cleanup stability.
- **Options page load**: `options.html` had a malformed `<script>` tag and an outdated title.
  Fixed the tag and unified the title with the extension name.
- **Popup ↔ content wiring**: `content.js` now implements `GET_LOCAL_ENABLED` and
  `SET_LOCAL_ENABLED` message handlers so the popup can read/apply per-tab enable
  state immediately. This resolves cases where the popup wouldn’t reflect or apply
  the current tab’s setting.

### Notes
- No new permissions.
- User-facing behavior unchanged except better reliability for per-tab toggles and Options loading.

## 1.1.0 — 2025-10-20
### User-facing
- **Live streams (YouTube + Twitch):** show **elapsed time (count-up)** in the tab title.
  Uses safe fallbacks (live edge / UI labels / platform start) with sanity checks
  to avoid “+1 hour” and DVR quirks. Pauses freeze the display.
- **LIVE badge:** shows a live indicator on the extension action.
- **Popup improvements:** resilient **Mute/Unmute**, clearer per-tab Enable/Disable,
  quick per-site “Finished” toggle, and shortcuts/Options buttons.
- **Options improvements:** “Finished” can be **Forever** (0 ms), last non-zero ms is preserved.
- **YouTube DVR guard:** avoids **59:59** false duration after reload.

### Internal / Stability
- Better SPA navigation handling and metadata re-probing.
- Non-breaking; no new permissions.

## 1.0.1 — 2025-10-15
### User-facing
- No UI/feature changes in this release.

### Internal / Tooling
- Added `scripts/release.sh` (interactive; supports `nobump`, `--push-only`, and double-bump guards).
- **Fix:** `release.sh` menu Bash/zsh-compatible.
- Thin `bump-*` wrappers and docs updates.

## 1.0.0 — 2025-10-10
### User-facing
- Show remaining time in the tab title (Playing/Paused).
- One-click Mute/Unmute across iframes.
- Per-site enable/disable and “Finished” banner control.
- Options page; no tracking (settings Sync/Local).

### Internal / Tooling
- Initial packaging script.

## Unreleased
- (add upcoming changes here)
