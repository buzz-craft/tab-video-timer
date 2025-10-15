#!/usr/bin/env bash
set -euo pipefail
# Wrapper: bumps MAJOR via release.sh (X.0.0)
exec "$(dirname "$0")/release.sh" major
