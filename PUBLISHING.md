# Publishing & Releases

## Versioning
- Semantic: `MAJOR.MINOR.PATCH`
- **Chrome requires** `manifest.json.version` to increase for every upload.

## One-step release
```bash
# Interactive menu + confirmation:
./scripts/release.sh

# Non-interactive:
./scripts/release.sh patch
./scripts/release.sh minor
./scripts/release.sh major
./scripts/release.sh nobump
./scripts/release.sh nobump --push-only
