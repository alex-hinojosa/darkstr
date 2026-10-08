#!/usr/bin/env bash
# darkstr 0047: compile the macOS 26+ app icon (Assets.car, icon "AppIcon") from one 1024 PNG.
# Why: macOS 26/27 draws every .icns-only app icon inside a gray "legacy" squircle plate — full-bleed
# and Big Sur-template art alike. An Assets.car compiled from an Icon Composer-style .icon, named by
# CFBundleIconName, is drawn dark to the edge. firefox.icns stays as CFBundleIconFile (fallback).
# Needs Xcode 26+ actool (xcrun actool). Run on the Mac mini.
#
# usage: scripts/darkstr-icon-assets-car.sh <art-1024.png> <fill-srgb "r,g,b" 0..255> [OUT_DIR] [--install]
#   writes OUT_DIR/AppIcon.icon (source bundle) and OUT_DIR/car/Assets.car;
#   --install copies Assets.car to ${DARKSTR_BRANDING_DIR:-$DARKSTR_GECKO_ROOT/browser/branding/darkstr}
set -euo pipefail
die() { echo "error: $*" >&2; exit 1; }
[[ $# -ge 2 ]] || { sed -n '2,11p' "$0"; exit 2; }
ART="$1"; FILL="$2"; shift 2; OUT="./darkstr-assets-car-out"; INSTALL=0
if [[ $# -gt 0 && "$1" != --* ]]; then OUT="$1"; shift; fi
[[ "${1:-}" == --install ]] && INSTALL=1
[[ -f "$ART" ]] || die "missing $ART"
[[ "$(sips -g pixelWidth "$ART" | awk '/pixelWidth/{print $2}')" == 1024 ]] || die "$ART must be 1024x1024"
IFS=, read -r R G B <<<"$FILL"
srgb=$(awk -v r="$R" -v g="$G" -v b="$B" 'BEGIN{printf "srgb:%.5f,%.5f,%.5f,1.00000", r/255, g/255, b/255}')
rm -rf "$OUT/AppIcon.icon" "$OUT/car"; mkdir -p "$OUT/AppIcon.icon/Assets" "$OUT/car"
cp "$ART" "$OUT/AppIcon.icon/Assets/art.png"
cat > "$OUT/AppIcon.icon/icon.json" <<JSON
{
  "fill" : { "solid" : "$srgb" },
  "groups" : [ { "layers" : [ { "image-name" : "art.png", "name" : "art" } ] } ],
  "supported-platforms" : { "squares" : "shared" }
}
JSON
xcrun actool "$OUT/AppIcon.icon" --compile "$OUT/car" --app-icon AppIcon --platform macosx \
  --minimum-deployment-target 11.0 --target-device mac \
  --output-partial-info-plist "$OUT/car/partial.plist" --output-format human-readable-text
[[ -s "$OUT/car/Assets.car" ]] || die "actool produced no Assets.car"
grep -q "<string>AppIcon</string>" "$OUT/car/partial.plist" || die "partial.plist lacks CFBundleIconName AppIcon"
rm -f "$OUT/car/AppIcon.icns"   # firefox.icns (from darkstr-icon-from-png.sh) stays the CFBundleIconFile
shasum -a 256 "$OUT/car/Assets.car" "$ART"
if [[ $INSTALL == 1 ]]; then
  BR="${DARKSTR_BRANDING_DIR:-${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}/browser/branding/darkstr}"
  [[ -f "$BR/Assets.car" ]] && cp -p "$BR/Assets.car" "$OUT/Assets.car.replaced"
  cp "$OUT/car/Assets.car" "$BR/Assets.car" && echo "installed $BR/Assets.car"
fi
