# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 1.1.1 — 2025-10-21
### Fixed
- **Service worker crash:** `background.js` tail listener was truncated, causing registration failures.
- **Options page load:** malformed `<script>` tag and outdated title in `options.html`.
- **Popup ↔ content wiring:** `content.js` now handles `GET_LOCAL_ENABLED` / `SET_LOCAL_ENABLED` for per-tab enable state.

### Internal / Tooling
- **release.sh bump guard:** stop refusing bumps when the latest tag equals the *current* manifest version; only refuse if the **target tag** already exists. Also supports `nobump` and `--push-only`.
- (Optional) Thin wrappers `bump-{patch,minor,major}.sh` delegate to `release.sh`.

## 1.1.0 — 2025-10-20
### User-facing
- **Live streams (YouTube + Twitch):** show **elapsed time (count-up)** in the tab title with guards against bad timestamps/DVR quirks. Pauses freeze the display.
- **LIVE badge** on the action icon.
- **Popup**: resilient Mute/Unmute, clearer per-tab Enable/Disable, quick per-site “Finished”, Options/Shortcuts buttons.
- **Options**: “Finished” can be **Forever** (0 ms) and preserves your last non-zero value.
- **YouTube DVR guard:** avoids the **59:59** false duration after reload.

### Internal / Stability
- Better SPA navigation handling and metadata re-probing.
- No new permissions.

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