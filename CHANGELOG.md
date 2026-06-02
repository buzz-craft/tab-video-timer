# Changelog
All notable changes to this project will be documented in this file.
Format inspired by Keep a Changelog. Versioning: SemVer.

## 2.0.5 — 2026-06-01
### Fixed
- **Enable/disable button now reflects actual timer state:** the popup button previously showed "Enable timer" whenever no local override was set, even if the timer was actively running via site settings. It now shows the correct label based on the effective enabled state.
- **Enable/disable toggle now sends the correct value:** clicking the button now toggles from the effective state rather than the (possibly stale) label state, so the first click always does what the label says.
- **Custom separator no longer breaks title stripping:** `stripDecor()` now builds its pattern from the current `settings.separator` rather than a hardcoded ` • `. On non-YouTube/Twitch sites with a custom separator, the decoration prefix was not stripped from `document.title`, causing it to accumulate on every tick.
- **`stripDecor` now also handles `%` progress and rate badge in the title** (e.g. `⏳ 14:32 (67%) @1.5× • …`).
- **Manifest `action.default_icon`:** corrected the size key from `"32"` to `"48"` so the 48 × 48 image is served at the right density instead of being scaled from the wrong slot.
- **Options page markup:** replaced two invalid `<form-content>` custom elements with `<div>` for valid HTML.

### Notes
- No new permissions. No analytics.

## 2.0.4 — 2026-06-01
### Fixed
- **Break reminder can now fire more than once per page session:** `breakReminderFired` is reset when playback pauses alongside the continuous-watch timer, so pausing and resuming allows the reminder to fire again after another N minutes of uninterrupted watching.
- **Video picker selection resets on navigation:** `selectedVideoIndex` is now cleared to 0 when the URL changes, preventing a pinned index from carrying over to a new page where it may not exist or may select the wrong video.

### Notes
- No new permissions. No analytics.

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

## 2.0.6 — 2026-06-02
### Added
- **Keep video playing when tab is inactive:** new option in Options → Playback Display and in the popup controls. When enabled, if a site pauses the video on tab switch the extension immediately resumes playback within 100 ms.

### Fixed
- **False LIVE badge on popup open:** `isStrongLive()` treated `NaN` duration (video element still loading metadata) as a live stream. Changed check to `dur === Infinity` so the badge only appears for genuine live streams.
- **Mute button now works:** `tryContentScriptToggle` was running before `forcePageToggle`, muting the media and causing `forcePageToggle` to immediately unmute it again. Removed the redundant first call.
- **Mute button shows wrong state when no top-frame media exists:** `forcePageToggle` returned `{ muted: true }` when the media array was empty (e.g. video only in an iframe), flipping the button label to "Unmute" incorrectly. Now returns `{ muted: false }` when nothing is found.
- **Unmuting no longer auto-resumes paused videos:** `forcePageToggle` was calling `v.play()` on paused-but-ready elements when unmuting — unexpected side-effect removed.
- **Watch segment not flushed when timer is disabled mid-session:** `tick()` returned early without calling `onWatchPaused()` when the timer was disabled, leaving `watchSegmentStart` set. On the next navigation the entire elapsed wall-clock time since the segment began was flushed, overcounting watch time. `onWatchPaused()` is now called before the early return.
- **Overlay setting change requires page reload:** enabling the overlay in Options had no effect in already-open tabs because `chrome.storage.onChanged` did not call `toggleOverlay()`. Now applies immediately.
- **Keep-playing no longer fights user-initiated pauses:** the pause listener now only auto-resumes if the pause occurred within 600 ms of the tab becoming hidden (site-triggered), ignoring deliberate user pauses that arrive later.
- **Video picker selection highlight uses index not DOM position:** the immediate visual update after clicking a video item now matches by `data-video-index` attribute instead of forEach loop counter, fixing a latent mismatch if video indices were ever non-contiguous.
- **Timer-disabled pages no longer freeze the site's own title:** `tick()` was calling `hideGuardStart()` unconditionally for any disabled page, starting a title-locking MutationObserver even when "hide timer when tab inactive" was off. Title locking now only activates when the tab is actually hidden.
- **Tab switch no longer resets break-reminder countdown:** the watch-segment flush added to `tick()`'s early-return was calling `onWatchPaused()`, which also zeroed `continuousWatchSecs`. The early-return now only flushes the accumulator directly, leaving break-reminder state untouched.
- **Overlay does not reopen after user closes it:** the `chrome.storage.onChanged` handler was calling `toggleOverlay(true)` on every settings change, reopening the overlay even if the user had dismissed it with ×. It now only calls `toggleOverlay` when `showOverlay` itself changes.
- **Mute button no longer crashes on restricted pages:** `forcePageToggle` had no try/catch around `chrome.scripting.executeScript`, causing an unhandled rejection on `chrome://` or PDF tabs. Now returns `null` gracefully.

### Notes
- No new permissions. No analytics.

## 2.0.7 — 2026-06-02
### Fixed
- **LIVE badge removed from popup:** was incorrectly appearing on non-video pages and sites with hidden audio/video elements (e.g. claude.ai voice interface).
- **Extension icon corners:** white corner pixels replaced with full transparency on all icon sizes (16, 48, 128).
- **Popup title centered.**

### Notes
- No new permissions. No analytics.

## Unreleased
- (add upcoming changes here)
