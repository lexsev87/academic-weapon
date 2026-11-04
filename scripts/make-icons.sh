#!/bin/zsh
# Builds every icon from design/logo-source.webp (square artwork, any size):
#   - clips it to the macOS rounded rect and places it on the 824/1024 icon grid with a shadow
#   - src/assets/logo.png (256 px, used in the app UI), public/icon.png (64 px favicon)
#   - desktop/icon.icns (Mac app icon)
# Needs only macOS tools: sips, base64, qlmanage, iconutil.
set -euo pipefail
cd "${0:A:h}/.."
src=design/logo-source.webp
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

sips -s format png -z 1024 1024 "$src" --out "$work/art.png" >/dev/null
b64=$(base64 -i "$work/art.png")
cat > "$work/icon.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="plate"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="#1b2a3a" filter="url(#shadow)"/>
  <image x="100" y="100" width="824" height="824" preserveAspectRatio="xMidYMid slice" clip-path="url(#plate)" xlink:href="data:image/png;base64,$b64"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="3"/>
</svg>
SVG
qlmanage -t -s 1024 -o "$work" "$work/icon.svg" >/dev/null 2>&1
master="$work/icon.svg.png"
[[ -f $master ]] || { echo "render failed" >&2; exit 1; }

sips -z 256 256 "$master" --out src/assets/logo.png >/dev/null
sips -z 64 64 "$master" --out public/icon.png >/dev/null
mkdir -p "$work/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$master" --out "$work/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$master" --out "$work/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$work/icon.iconset" -o desktop/icon.icns
echo "icons: src/assets/logo.png, public/icon.png, desktop/icon.icns"
