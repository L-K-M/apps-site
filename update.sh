#!/usr/bin/env bash
# Refresh the Compose deployment from main, rebuild, regenerate, and serve.
# Usage: ./update.sh
# Requires git and Docker Compose v2. Uses compose.yaml's environment settings.
set -euo pipefail
cd "$(dirname "$0")"
git switch main
git pull --ff-only origin main
docker compose pull
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps
