#!/bin/zsh
# Builds every icon from design/logo-source.webp (square artwork, any size):
#   - clips it to the macOS rounded rect on the 824/1024 icon grid, with a shadow, on a
#     truly transparent canvas (scripts/render-icon.swift)
#   - src/assets/logo.png (256 px, used in the app UI), public/icon.png (64 px favicon)
#   - desktop/icon.icns (Mac app icon)
# Needs only macOS tools: swift, sips, iconutil.
set -euo pipefail
cd "${0:A:h}/.."
src=design/logo-source.webp
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Native renderer: transparent canvas, so no white corners or margins.
swift scripts/render-icon.swift "$src" "$work/master.png" 1024
master="$work/master.png"

sips -z 256 256 "$master" --out src/assets/logo.png >/dev/null
sips -z 64 64 "$master" --out public/icon.png >/dev/null
mkdir -p "$work/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$master" --out "$work/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$master" --out "$work/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$work/icon.iconset" -o desktop/icon.icns
echo "icons: src/assets/logo.png, public/icon.png, desktop/icon.icns"
