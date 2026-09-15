#!/usr/bin/env bash
set -euo pipefail

foundry_data="${OSP_FOUNDRY_DATA:-/Users/paul/FoundryData/osp-dev}"
legacy_root="${OSP_LEGACY_ASSETS:-/Users/Shared/foundry/narlington-data/backups/foundrySharedData}"
font_source="$legacy_root/fonts"
portrait_source="$legacy_root/assets/tokens/players"
asset_root="$foundry_data/Data/assets/additional-assets"
font_target="$asset_root/fonts"
portrait_target="$asset_root/portraits"

mkdir -p "$font_target" "$portrait_target"

required_fonts=(
  "Council Regular.ttf"
  "Futura Condensed Bold.otf"
  "Minion Pro Regular.ttf"
  "Mr Eaves Small Caps.otf"
  "Treamd.ttf"
  "GloriaHallelujah-Regular.ttf"
  "Handwritten.ttf"
  "Cooper_Std_Black.ttf"
)

for font in "${required_fonts[@]}"; do
  if [[ ! -f "$font_source/$font" ]]; then
    echo "Missing legacy font source: $font_source/$font" >&2
    exit 1
  fi
  cp -p "$font_source/$font" "$font_target/$font"
done

# Old worlds used several generations of portrait paths. Restore the named player portraits
# under predictable lowercase slugs without changing any actor records.
if command -v cwebp >/dev/null 2>&1 && [[ -d "$portrait_source" ]]; then
  while IFS= read -r -d '' portrait; do
    name="$(basename "${portrait%.*}")"
    slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-')"
    slug="${slug%-}"
    cwebp -quiet -q 90 "$portrait" -o "$portrait_target/$slug.webp"
  done < <(find "$portrait_source" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print0)
fi

echo "Development fonts and player portraits are available under $asset_root"
