#!/usr/bin/env bash
# Séance's existing widget test uses temporary storage, mock keychain and example hosts.
set -euo pipefail
site_root="$(cd "$(dirname "$0")/../../.." && pwd)"
source_root="$(dirname "$site_root")/Hauntware/seance/app/seance_app"
capture_output="$(mktemp -d -t cabinet-seance)"
trap 'rm -rf "$capture_output"' EXIT
cd "$source_root"
SEANCE_CAPTURE=1 SEANCE_CAPTURE_DIR="$capture_output" \
  "${FLUTTER_BIN:-flutter}" test test/server_list_capture_test.dart \
  --plain-name 'captures a narrow desktop window (comfortable, light)'
cp "$capture_output/home-desktop-comfortable-light.png" "$site_root/catalogue/assets/seance.png"
