# Tab Video Timer

Shows remaining time in the tab title, quick Mute/Unmute, and per-site controls.

## Features
- Time left in the **tab title** (Playing/Paused)
- One-click **Mute/Unmute** across iframes
- Per-site enable/disable + “Finished” banner control
- No tracking; settings stored locally (Chrome Sync optional)

## Install (for users)
- **Chrome Web Store:** _link coming soon_  
  *(Or load unpacked for development; see below.)*

## Install (unpacked, developers)
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

## Usage
- Pin the extension → open a page with media
- Watch countdown in the **tab title**
- Click the icon for **Mute/Unmute** & per-site toggles
- Configure in **Options**

## Permissions
- `storage` – save settings and site preferences
- `tabs` – read hostname for per-site rules
- `scripting` + `host_permissions` – detect/mute media elements across frames

## Privacy
- No analytics, no tracking, no external requests.  
- Data stays in the browser (Chrome Sync optional).

## Support
- Open an issue on GitHub with steps to reproduce.