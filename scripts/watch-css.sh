#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

fingerprint() {
  find src/styles -type f -name '*.scss' -exec shasum {} + | sort | shasum | awk '{print $1}'
}

previous="$(fingerprint)"
while true; do
  sleep 1
  current="$(fingerprint)"
  if [[ "$current" != "$previous" ]]; then
    echo "Sass source changed; rebuilding CSS."
    /opt/homebrew/opt/node@24/bin/node ./scripts/build-css.js
    previous="$current"
  fi
done
