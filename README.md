# Tab Video Timer

Adds a mini timer to your **tab title**:
- **VOD:** time **remaining** or **elapsed** (Playing / Paused)
- **LIVE (YouTube/Twitch):** time **elapsed** (count-up)

Live video status in the popup, quick **Mute/Unmute**, per-site toggles, and a full Options page.  
No tracking. Settings stay in your browser (Chrome Sync optional).

---

## Features
- ⏳ **VOD timer** in the tab title — **countdown** (time remaining) or **elapsed** (time watched), your choice
- 🔴 **LIVE elapsed** timer for YouTube & Twitch, with guards against bad timestamps/DVR quirks
- 📊 **Popup status card** — live video state, large time display, and a progress bar with elapsed/total
- 🎬 **Streaming sites grid** — one-click enable/disable for 12 services in Options
- 🔇 **One-click Mute/Unmute** across iframes
- ⚙️ **Per-site enable/disable** and **”Finished” banner** controls
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
   - VOD shows: `⏳ 12:34 • Title` (or `⏸ 12:34 • Title` when paused)  
   - LIVE shows: `🔴 LIVE 1:23:45 • Title`
3. Click the icon for **Mute/Unmute**, **Enable/Disable** (per-tab), and per-site toggles.
4. Open **Options** to customize titles/prefixes and behavior.

---

## Options
- **Title labels:**
  - **Live Title** → `prefixLivePlaying` (default: `🔴 LIVE`)
  - **VOD Title** → `prefixVODPlaying` (default: `⏳`)
  - **Paused Title** → `prefixPaused` (default: `⏸`)
- **VOD Timer Mode (v1.2.0):** Countdown (time remaining) or Elapsed (time watched).
- **Title Separator (v1.2.0):** customize the string between the timer and page title (default: ` • `).
- **Show % progress (v1.2.0):** append e.g. `(67%)` to the VOD timer in the tab title.
- **Finished hold (ms):**  
  - **Forever** checkbox holds the “Finished” title indefinitely (0 ms).  
  - **Dynamic hint** shows **~seconds** when not Forever; **”Title will be held indefinitely”** when checked.
- **Streaming sites quick-enable (v1.2.0):** chip grid for 12 popular services.
- **Per-site control:** enable/disable the timer and show/hide “Finished” on specific hosts.
- **Update interval (ms)** and **Hide when tab inactive**.

> **Migration:** If you customized the old `prefixPlaying`, it seeds both new fields until you **Save**.

---

## Shortcuts
Set in `chrome://extensions/shortcuts`:
- **Mute active tab**  
- **Enable/Disable on this site**

(Also available via the popup.)

---

## Permissions (why)
- `storage` — save settings and per-site preferences
- `tabs` — read the current tab’s hostname for site rules
- `scripting` — inject a tiny content script to detect/mute media and update the title
- `host_permissions: <all_urls>` — work on sites **you visit** with media

No external requests. No analytics.

---

## Troubleshooting
- **Live timer off / drifting:** some pages expose wrong starts. We prefer the **live edge** and only trust page timestamps when they’re plausible. If a channel is consistently wrong, open an issue with the URL.
- **59:59 on YouTube after reload:** we quarantine early DVR reads to avoid the false 59:59 duration.
- **Options “Receiving end does not exist”:** fixed; Options now filters tabs and ignores restricted pages (v1.1.2).

---

## Development
```bash
# package a ZIP for the Web Store
./scripts/package.sh

# release helper (interactive: patch/minor/major/nobump; can skip packaging)
./scripts/release.sh
# examples:
#   ./scripts/release.sh patch
#   ./scripts/release.sh nobump
#   ./scripts/release.sh nobump --push-only
