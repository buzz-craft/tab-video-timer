# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 2.0.3 — 2026-05-28
### Fixed
- **Break reminder now requires truly continuous watching:** the continuous-watch timer resets to zero on any pause; previously it accumulated through pauses, causing the reminder to fire too soon after resuming.
- **Watch-time flush on page unload is now reliable:** replaced the async `reportWatchTime()` call in the `beforeunload` handler with a synchronous fire-and-forget that resets the accumulator eagerly before the page can unload.
- **Overlay checkbox now reflects actual state on popup open:** the "Show page overlay" checkbox is initialised from `chrome.storage.sync` settings; previously it was always unchecked regardless of the stored preference.

### Notes
- No new permissions. No analytics.

## 2.0.2 — 2026-05-28
### Fixed
- **Overlay on load:** overlay now correctly shows on page load when "Show overlay by default" is enabled; previously `computeEnabledFlags()` was not called before the overlay visibility check in `loadSettings()`.
- **Watch-time lost on SPA navigation:** accumulated watch-time is now flushed to storage before counters are reset on YouTube/SPA page transitions; previously seconds watched on the current video were discarded.
- **Break reminder misfiring after pause/resume:** the continuous-watch timer now pauses when playback pauses (`onWatchPaused` clears `continuousSegStart`); previously the timer kept running through pauses, causing the reminder to fire too early on resume.
- **Tab title briefly reverting on YouTube chapter change:** `metaObserver` now includes `characterData: true` so it catches direct `<title>` text mutations made by YouTube's own JS, not just child-list changes.
- **Video picker flicker:** picker list is no longer re-rendered on every 1-second poll; it only rebuilds when the video list shape or selection actually changes, preventing clicks from being swallowed during re-render.

### Notes
- No new permissions. No analytics.

## 2.0.1 — 2026-05-26
### Changed
- **Extension icon:** redesigned at all sizes (16×16, 48×48, 128×128) — modern rounded-square with dark-blue gradient background and white hourglass; replaces the old flat cyan icon.
- **Popup:** removed hostname display from header for a cleaner look.
- **Popup footer:** Options and Shortcuts buttons centered with equal spacing; ellipsis removed from labels.
- **Options:** removed Streaming Sites quick-enable grid; default enable behaviour is controlled by the "Enable by default on new sites" checkbox in Display settings.

### Notes
- No new permissions. No analytics.

## 2.0.0 — 2026-05-26
### Added
- **Speed-aware countdown:** VOD time remaining adjusts in real-time for 1.5×, 2× etc. playback rates. Tab title shows `@1.5×` indicator when rate ≠ 1.
- **YouTube chapter titles:** current chapter name prepended to the tab title while a chapter is active.
- **Multi-video picker:** popup lists all videos on the page; click to pin which one the timer tracks.
- **Page overlay:** draggable floating timer that lives on top of any page. Toggle from the popup or Options. Position (bottom-right/left, top-right/left) configurable.
- **Watch-time tracking:** records seconds watched per site per day (up to 30 days, stored locally). Flush every 30 s and on page unload.
- **Stats tab in popup:** today's total watch time, optional daily limit progress bar, per-site breakdown, and a 7-day bar chart.
- **Daily limit:** set a minute threshold in Options → Watch Time & Alerts; limit bar appears in the popup when exceeded.
- **Break reminder:** browser notification after N continuous minutes of watching (0 = disabled).
- **Video-ended notification:** browser notification when a tracked video finishes (opt-in).
- **Popup redesign:** two-tab layout (Now Playing / Stats), rate badge, chapter title line, video picker card.
- **Options — Playback Display section:** speed-aware countdown toggle, show-chapters toggle, overlay position selector, overlay default-on toggle.
- **Options — Watch Time & Alerts section:** track-watch-time toggle, daily limit, break reminder, end-notification toggle.

### Changed
- `manifest.json` version → 2.0.0; added `notifications` permission.
- `background.js` rewritten: watch-time storage, stats queries, notification dispatch, retained badge and mute helpers.

### Notes
- No new host permissions. No analytics.

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

## 1.2.0 — 2026-05-26
### Added
- **VOD Timer Mode:** choose between **Countdown** (time remaining) or **Elapsed** (time watched) in Options. Both modes respect pause and playback speed.
- **Popup video status card:** live view of current video state — icon, playing/paused label, and a large time display. Updates every second.
- **Progress bar in popup:** visual bar showing how far through a VOD you are, with elapsed and total timestamps below it.
- **Live stream status in popup:** LIVE badge, playing/paused label, and elapsed time for live streams.
- **Configurable title separator:** change the ` • ` between the prefix and page title to any string via Options.
- **% progress in tab title:** optional setting to append e.g. `(67%)` to the VOD timer in the tab title.
- **Streaming sites quick-enable grid:** one-click enable/disable chips for 12 popular services (YouTube, Twitch, Netflix, Disney+, Prime Video, Hulu, Max, Peacock, Paramount+, Crunchyroll, Vimeo, Dailymotion) directly in Options.

### Notes
- No new permissions. No analytics.

## Unreleased
- (add upcoming changes here)
