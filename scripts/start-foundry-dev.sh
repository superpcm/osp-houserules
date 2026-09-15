#!/usr/bin/env bash
set -euo pipefail

foundry_app="${OSP_FOUNDRY_APP:-/Users/paul/Applications/FoundryVTT-Node-14.367}"
foundry_data="${OSP_FOUNDRY_DATA:-/Users/paul/FoundryData/osp-dev}"
foundry_world="${OSP_FOUNDRY_WORLD:-westford}"
foundry_port="${OSP_FOUNDRY_PORT:-30000}"
node24="${OSP_NODE24:-/opt/homebrew/opt/node@24/bin/node}"

if [[ ! -x "$node24" ]]; then
  echo "Node 24 was not found at: $node24" >&2
  echo "Install it with: brew install node@24" >&2
  exit 1
fi

if [[ ! -f "$foundry_app/main.js" ]]; then
  echo "Foundry's Node distribution was not found at: $foundry_app" >&2
  echo "Download the Foundry VTT v14 Node.js build and extract it there." >&2
  exit 1
fi

if [[ ! -d "$foundry_data/Data/worlds/$foundry_world" ]]; then
  echo "Foundry world '$foundry_world' was not found under: $foundry_data/Data/worlds" >&2
  exit 1
fi

"$(dirname "$0")/sync-dev-assets.sh"

echo "Starting Foundry at http://localhost:$foundry_port using world '$foundry_world'."
exec "$node24" "$foundry_app/main.js" \
  --dataPath="$foundry_data" \
  --port="$foundry_port" \
  --world="$foundry_world" \
  --noupnp \
  --noupdate \
  --hotReload
