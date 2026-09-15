#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

cleanup() {
  trap - EXIT INT TERM
  kill "$js_pid" "$css_pid" 2>/dev/null || true
  wait "$js_pid" "$css_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

./node_modules/.bin/rollup -c -w &
js_pid=$!
./scripts/watch-css.sh &
css_pid=$!

echo "Watching JavaScript, TypeScript, and Sass sources."
wait "$js_pid"
wait "$css_pid"
