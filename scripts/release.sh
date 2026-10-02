#!/usr/bin/env bash
# Bump, commit and tag the generator version; --push triggers the release build.
# Usage: scripts/release.sh [X.Y.Z] [--push]
# Shared engine: https://github.com/L-K-M/release-tool
set -euo pipefail
cd "$(dirname "$0")/.."
export RELEASE_APP_NAME="apps-site"
export RELEASE_KIND="npm"
export RELEASE_CI_NOTE="CI will check and publish the generated static site."
export RELEASE_INVOKED_AS="scripts/release.sh"
BIN="${LKM_RELEASE_BIN:-lkm-release}"
command -v "$BIN" >/dev/null 2>&1 || {
  echo "error: install lkm-release from https://github.com/L-K-M/release-tool" >&2
  exit 1
}
exec "$BIN" "$@"
