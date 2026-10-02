#!/usr/bin/env bash
# Build and check the static directory. Requires Node 22.14+ and npm.
# Usage: scripts/build.sh
# The shared lkm-build engine has no Node/static-site adapter.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run check
