# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 1.1.0 — 2025-10-20
### User-facing
- **Live streams (YouTube + Twitch):** show **elapsed time (count-up)** in the tab title. Uses safe fallbacks (live edge / UI labels / platform start) with sanity checks to avoid “+1 hour” and other clock drift. Pauses freeze the live timer display.
- **Popup improvements:** resilient **Mute/Unmute** across frames, clearer **Enable/Disable timer** per-tab label, quick per-site “Finished” toggle, and buttons for **Options** and **Shortcuts**.
- **Options improvements:** “Finished” can be **Forever** (0 ms), and your last non-zero ms value is preserved. Per-site controls are clearer.  
- **YouTube DVR guard:** avoids the classic **59:59** false duration right after navigation/reload.
- **Twitch stability:** handles stream swaps/raids without carrying over old timers.

### Internal / Stability
- Better title sourcing for both platforms, SPA navigation handling, and metadata re-probing.
- Non-breaking; no new permissions.

## 1.0.1 — 2025-10-15
### User-facing
- No UI/feature changes in this release.

### Internal / Tooling
- Added `scripts/release.sh` (interactive; supports `nobump`, `--push-only`, and double-bump guards).
- **Fix:** `release.sh` menu now Bash/zsh-compatible.
- Made `bump-major.sh`, `bump-minor.sh`, `bump-patch.sh` thin wrappers around `release.sh`.
- Updated docs: `PUBLISHING.md`, `README.md`.

## 1.0.0 — 2025-10-14
### User-facing
- Show remaining time in the tab title (Playing/Paused).
- One-click Mute/Unmute across iframes.
- Per-site enable/disable and “Finished” banner control.
- Options page; no tracking (settings Sync/Local only).

### Internal / Tooling
- Initial packaging script `scripts/package.sh`.

## Unreleased
- (add upcoming changes here)
