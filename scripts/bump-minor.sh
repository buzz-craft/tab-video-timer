#!/usr/bin/env bash
set -euo pipefail
# Wrapper: bumps MINOR via release.sh (x.Y.0)
exec "$(dirname "$0")/release.sh" minor
