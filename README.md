# Tab Video Timer

Adds a mini timer to your **tab title**:
- **VOD:** time **remaining** or **elapsed** (Playing / Paused), speed-adjusted for 1.5×, 2× etc.
- **LIVE (YouTube/Twitch):** time **elapsed** (count-up)

Watch-time stats, break reminders, video-end notifications, and a full Options page.  
No tracking. Settings stay in your browser (Chrome Sync optional).

---

## Features
- ⏳ **VOD timer** in the tab title — **countdown** or **elapsed**, speed-aware (adjusts for playback rate)
- 🔴 **LIVE elapsed** timer for YouTube & Twitch, with guards against bad timestamps/DVR quirks
- 📖 **YouTube chapter titles** shown in the tab title while a chapter is active
- 📊 **Popup status card** — icon, playing/paused state, rate badge, large time display, progress bar
- 🎬 **Multi-video picker** — choose which video to track on pages with multiple players
- ⧉ **Page overlay** — draggable floating timer that stays on top of any page
- 📈 **Watch-time stats** — Today view with per-site breakdown, 7-day chart, optional daily limit bar
- 🔔 **Notifications** — alert when a video ends; break reminder after N continuous minutes
- 🔇 **One-click Mute/Unmute** across iframes
- ⚙️ **Per-site enable/disable** and **"Finished" banner** controls
- 🧰 Options for title prefixes, separator, % progress, update interval, Finished hold (including **Forever**)
- 🔒 No analytics; data stored in `chrome.storage.(sync|local)`

---

## Install (for users)
- **Chrome Web Store:** _link coming soon_  
  *(Upload the ZIP built from `scripts/package.sh` and update this link.)*

Or install unpacked (for development):
1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo folder

---

## Usage
1. Pin the extension.
2. Open a page with **video or audio**.  
   - VOD shows: `⏳ 5:32 • Video Title` (or `⏸ 5:32 • Video Title` when paused)  
   - At 1.5× speed: `⏳ 3:41 @1.5× • Video Title`  
   - LIVE shows: `🔴 1:23:45 • Stream Title`  
   - YouTube chapter active: `⏳ 5:32 • Chapter Name — Video Title`
3. Click the icon to open the popup:
   - **Now Playing** tab — status, progress bar, mute, enable/disable, overlay toggle
   - **Stats** tab — today's watch time, per-site breakdown, 7-day chart
4. Open **Options** to customize all behavior.

---

## Options

### Display
- **Live / VOD / Paused title prefixes** — emoji or text shown before the timer
- **VOD Timer Mode** — Countdown (time remaining) or Elapsed (time watched)
- **Speed-aware countdown** — remaining time adjusted for playback rate (1.5×, 2× etc.)
- **Show YouTube chapter** — prepend the current chapter name to the tab title
- **Title separator** — string between the timer and page title (default: ` • `)
- **Show % progress** — append e.g. `(67%)` to the VOD timer
- **Finished hold** — how long to show the "Finished" title after a video ends (0 = forever)
- **Update interval** and **Hide timer when tab inactive**

### Page Overlay
- **Show overlay by default** — floating draggable timer on every page
- **Overlay position** — Bottom-right, bottom-left, top-right, top-left

### Watch Time & Alerts
- **Track watch time** — records time spent watching per site, stored locally
- **Daily limit** — shows a warning bar in the popup when exceeded (0 = disabled)
- **Break reminder** — browser notification after N continuous minutes of watching (0 = disabled)
- **Notify when video ends** — browser notification when a video finishes

### Per-site Control
- Enable/disable the timer per hostname
- Show/hide the "Finished" banner per hostname

> **Migration from v1.x:** If you customized `prefixPlaying`, it seeds both Live and VOD prefix fields until you **Save** in Options.

---

## Shortcuts
Set in `chrome://extensions/shortcuts`:
- **Mute active tab** (`Ctrl+Shift+M` / `Cmd+Shift+M`)
- **Enable/Disable on this site** (`Ctrl+Shift+T` / `Cmd+Shift+T`)

(Also available via the popup.)

---

## Permissions (why)
- `storage` — save settings and per-site preferences
- `tabs` — read the current tab's URL for site rules
- `scripting` — detect and control media, update the tab title
- `notifications` — break reminders and video-end alerts
- `host_permissions: <all_urls>` — work on sites **you visit** with media

No external requests. No analytics.

---

## Troubleshooting
- **Live timer off / drifting:** some pages expose wrong start timestamps. The extension prefers the live edge and sanity-checks all values. Open an issue with the URL if consistently wrong.
- **59:59 on YouTube after reload:** DVR quarantine prevents the false 59:59 duration from showing.
- **Stats not updating:** watch-time is flushed every 30 seconds and on page unload. Short visits under 5 seconds are not recorded.
- **Overlay not appearing:** enable it in the popup ("Show page overlay") or in Options → Playback Display.

---

## Development
```bash
# package a ZIP for the Web Store
./scripts/package.sh

# release helper (interactive: patch/minor/major/nobump)
./scripts/release.sh
# examples:
#   ./scripts/release.sh patch
#   ./scripts/release.sh minor
#   ./scripts/release.sh nobump --push-only
```
