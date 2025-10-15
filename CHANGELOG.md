# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 1.0.1 — 2025-10-15
### User-facing
- No UI/feature changes in this release.

### Internal / Tooling
- Added `scripts/release.sh` (interactive; supports `nobump`, `--push-only`, and double-bump guards).
- **Fix:** `release.sh` menu now Bash/zsh-compatible (removed bad substitution causing `bad substitution` in zsh).
- Made `bump-major.sh`, `bump-minor.sh`, `bump-patch.sh` thin wrappers around `release.sh`.
- Updated docs: `PUBLISHING.md`, `README.md`.

## 1.0.0 — 2025-10-14
### User-facing
- Show remaining time in the tab title (Playing/Paused).
- One-click Mute/Unmute across iframes.
- Per-site enable/disable and “Finished” banner control.
- Options page; no tracking (settings local/Sync).

### Internal / Tooling
- Initial packaging script `scripts/package.sh`.

## Unreleased
- (add upcoming changes here)
