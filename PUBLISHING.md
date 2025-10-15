# Publishing & Releases

## Versioning
- Semantic: `MAJOR.MINOR.PATCH`
- Chrome requires `manifest.json.version` to increase for every upload.

## One-step release (recommended)
```bash
# Interactive (choose major/minor/patch)
./scripts/release.sh

# Or non-interactive:
./scripts/release.sh patch   # 1.0.0 -> 1.0.1
./scripts/release.sh minor   # 1.0.1 -> 1.1.0
./scripts/release.sh major   # 1.1.0 -> 2.0.0
