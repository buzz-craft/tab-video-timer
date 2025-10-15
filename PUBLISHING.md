# Publishing & Releases

## Versioning
- Semantic: `MAJOR.MINOR.PATCH`
- **Chrome requires** `manifest.json.version` to increase for every upload.

## One-step release
```bash
# Interactive: choose major/minor/patch or NO-BUMP
./scripts/release.sh

# Non-interactive:
./scripts/release.sh patch    # 1.0.0 -> 1.0.1
./scripts/release.sh minor    # 1.0.1 -> 1.1.0
./scripts/release.sh major    # 1.1.0 -> 2.0.0
./scripts/release.sh nobump   # no version change; push + package only
