#!/usr/bin/env bash
set -euo pipefail
# Wrapper: bumps PATCH via release.sh (x.y.Z -> x.y.Z+1)
exec "$(dirname "$0")/release.sh" patch
