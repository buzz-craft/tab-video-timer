# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 1.1.3 — 2025-10-23
### Fixed
- **Hide-when-inactive (LIVE streams):** titles no longer freeze when switching tabs/windows. Implemented an **immediate, strong hide-guard** that:
  - Starts/stops instantly on `visibilitychange`, `pagehide/pageshow`, and `blur/focus`.
  - Observes `<title>` **and** `<head>` to survive SPA `<title>` replacement on YouTube/Twitch.
  - Runs a lightweight periodic enforcer while hidden to keep the **base page title** visible.

### Notes
- No behavior change for VOD hiding (already correct); LIVE now matches it.
- No new permissions. No analytics.

## 1.1.2 — 2025-10-21
### Added
- **Separate playing prefixes:** `prefixLivePlaying` (default: `🔴 LIVE`) and `prefixVODPlaying` (default: `⏳`).
- **Options UI:** new fields to edit both playing prefixes; paused continues to use `prefixPaused`.

### Changed
- **content.js:** uses `prefixLivePlaying` for live elapsed titles and `prefixVODPlaying` for VOD countdown titles. Falls back to legacy `prefixPlaying` for existing users.

### Migration
- If you previously customized `prefixPlaying`, it is **used for both** new fields **until you Save** in Options. No action required unless you want different prefixes for LIVE and VOD.

### Notes
- No new permissions. No analytics.

## 1.1.1 — 2025-10-21
### Fixed
- **Service worker crash:** `background.js` tail listener was truncated, causing registration failures.
- **Options page load:** malformed `<script>` tag and outdated title in `options.html`.
- **Popup ↔ content wiring:** `content.js` now handles `GET_LOCAL_ENABLED` / `SET_LOCAL_ENABLED` for per-tab enable state.

### Internal / Tooling
- **release.sh bump guard:** stop refusing bumps when the latest tag equals the current manifest version; refuse only if the **target tag** already exists. Supports `nobump` and `--push-only`.

## 1.1.0 — 2025-10-20
### User-facing
- **Live streams (YouTube + Twitch):** show **elapsed time (count-up)** in the tab title with guards against bad timestamps/DVR quirks. Pauses freeze the display.
- **LIVE badge** on the action icon.
- **Popup:** resilient Mute/Unmute, clearer per-tab Enable/Disable, quick per-site “Finished”, Options/Shortcuts buttons.
- **Options:** “Finished” can be **Forever** (0 ms), last non-zero ms preserved.
- **YouTube DVR guard:** avoids the **59:59** false duration after reload.

### Internal / Stability
- Better SPA navigation handling and metadata re-probing.
- No new permissions.

## 1.0.1 — 2025-10-15
### User-facing
- No UI/feature changes in this release.

### Internal / Tooling
- Added `scripts/release.sh` (interactive; supports `nobump`, `--push-only`, and double-bump guards).
- Fix: `release.sh` menu Bash/zsh-compatible.
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
