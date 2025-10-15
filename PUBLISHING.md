# Publishing & Releases

## Versioning
- Semantic: `MAJOR.MINOR.PATCH`
- Chrome requires `manifest.json.version` to increase each upload.

## Bump version
Choose one:
```bash
./scripts/bump-patch.sh   # 1.0.0 → 1.0.1
./scripts/bump-minor.sh   # 1.0.1 → 1.1.0
./scripts/bump-major.sh   # 1.1.0 → 2.0.0
git push && git push --tags
