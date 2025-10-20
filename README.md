# Tab Video Timer

Adds a mini timer to your **tab title**:
- **VOD:** time remaining (Playing/Paused)
- **LIVE (YouTube/Twitch):** elapsed time (count-up)

Quick **Mute/Unmute**, per-site toggles, and a simple Options page.
No tracking. Settings stay in your browser (Chrome Sync optional).

---

## Features
- ⏳ **Time left** in the tab title (VOD: Playing / Paused)
- ⏳ **Live elapsed** time in the tab title (YouTube + Twitch), with guards against bad timestamps/DVR quirks
- 🔇 **One-click Mute/Unmute** across iframes
- ⚙️ **Per-site enable/disable** and **“Finished” banner** controls
- 🧰 Options for prefixes, finished hold, site overrides
- 🔒 **No tracking**; settings in `chrome.storage.(sync|local)`

---

## Install (for users)
- **Chrome Web Store:** https://chromewebstore.google.com/detail/tab-video-timer/hdkokdinnckanaahfjnofhccmghmoekc

Or install unpacked (developers):
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this repo folder

---

## Usage
1. Pin the extension
2. Open a page with video/audio  
3. Click the icon for **Mute/Unmute**, **Enable/Disable timer**, and quick site toggles
4. **Options** page allows “Finished” banner hold (including **Forever** with `0 ms`) and per-site rules

---

## Keyboard Shortcuts (configurable)
- **Mute active tab:** `Ctrl+Shift+M` (Windows/Linux), `⌘⇧M` (macOS)  
- **Toggle site on/off:** `Ctrl+Shift+T`, `⌘⇧T`  
Chrome → `chrome://extensions/shortcuts`

---

## Permissions (why we need them)
- `storage` — save your settings + per-site preferences
- `tabs` — read the active **hostname** for per-site rules
- `scripting` — inject a small content script to find/mute media and update the tab title
- `host_permissions: <all_urls>` — run on sites **you visit** so timers/mute work everywhere media plays

> No external network calls. No analytics.

---

## Troubleshooting
- **Live timer looks off by ~1 hour:** some pages expose wrong start timestamps. We prefer the **live edge** and only accept page timestamps if they’re close. If a specific channel looks wrong, open an issue with the URL and whether it’s **Premiere** or **DVR-only**.
- **Timer flickers or stays paused:** some players delay metadata. It should stabilize after a few seconds. If not, refresh the page.
- **Icons don’t show:** ensure `icon16.png`, `icon48.png`, `icon128.png` exist in the root of the extension folder.

---

## Privacy
- No analytics, no tracking, no external requests.  
- Settings are stored in Chrome Sync/Local only.

---

## Support

- Open an issue with steps to reproduce and the page URL:
https://github.com/buzz-craft/tab-video-timer/issues
