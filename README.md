# Tab Video Timer

Shows remaining time in the tab title, a mute toggle, and per-site controls.

## Install (unpacked)
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Publish
1. Bump version in `manifest.json` (or run `./scripts/bump-patch.sh`)
2. Run `./scripts/package.sh` — creates `dist/tab-video-timer-vX.Y.Z.zip`
3. Upload the ZIP to the Chrome Web Store developer dashboard
4. Paste notes from `CHANGELOG.md` into “What’s new”
# tab-video-timer
