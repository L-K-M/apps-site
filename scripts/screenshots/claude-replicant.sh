#!/bin/bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo="${1:?Pass the Claude-Replicant checkout}"
output="${2:?Pass the PNG destination}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sources=()
while IFS= read -r source; do sources+=("$source"); done < <(find "$repo/claude-many" -name '*.swift' ! -name ClaudeReplicantApp.swift)
swiftc -parse-as-library -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk -target arm64-apple-macos14.0 "${sources[@]}" "$script_dir/capture-support.swift" "$script_dir/claude-replicant.swift" -o "$work/capture"
"$work/capture" "$output"
