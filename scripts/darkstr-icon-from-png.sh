#!/usr/bin/env bash
# darkstr: generate macOS branding icons from one 1024x1024 PNG (PM master art).
# Run on the Mac mini (needs sips + iconutil). Default = generate into OUT_DIR only; nothing in
# the Gecko tree changes unless --install is given (the LibreWolf wolf stays until then).
#
# usage: scripts/darkstr-icon-from-png.sh <icon-1024.png> [OUT_DIR] [--install] [--doc <png>] [--disk <png>]
#   OUT_DIR   default: ./darkstr-icons-out
#   --install copy generated files into ${DARKSTR_GECKO_ROOT}/browser/branding/darkstr (originals
#             backed up to OUT_DIR/replaced-originals/ first; DARKSTR_BRANDING_DIR overrides target)
#   --doc     separate 1024 PNG for document.icns (Finder icon for .html/.pdf/etc.); default: same art
#   --disk    separate 1024 PNG for disk.icns (DMG volume icon); default: same art
#
# Produces (names = what browser/branding/darkstr uses on macOS):
#   firefox.icns   -> darkstr.app/Contents/Resources/firefox.icns (CFBundleIconFile; Dock/Finder/Cmd-Tab)
#   document.icns  -> Contents/Resources/document.icns (CFBundleDocumentTypes icon)
#   disk.icns      -> DMG .VolumeIcon.icns (toolkit/moz.configure --icon)
#   default16/22/24/32/48/64/128/256.png  (16..128 also -> chrome://branding/content/iconNN.png)
#   content/about-logo.png (192), content/about-logo@2x.png (384), and the -private variants
#     (About dialog, about:home / new tab logo, private browsing page)
#   *.iconset dirs with the full 16..1024 @1x/@2x set (kept for review)
# Not generated (Windows/MSIX-only, unused on macOS builds): *.ico, VisualElements_*, msix/Assets,
#   wiz*.bmp, PrivateBrowsing_*.png; also content/about.png (300x236 legacy, non-square).
# NOTE: chrome://branding/content is contentaccessible=yes. After --install + build, re-run the
#   web reach probe (0045 harness) and confirm chrome://branding/content/* stays blocked from pages.
set -euo pipefail
die() { echo "error: $*" >&2; exit 1; }
[[ $# -ge 1 ]] || { sed -n '2,12p' "$0"; exit 2; }
SRC="$1"; shift
OUT="./darkstr-icons-out"; INSTALL=0; DOC=""; DISK=""
if [[ $# -gt 0 && "$1" != --* ]]; then OUT="$1"; shift; fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) INSTALL=1 ;;
    --doc) DOC="$2"; shift ;;
    --disk) DISK="$2"; shift ;;
    *) die "unknown arg $1" ;;
  esac; shift
done
command -v sips >/dev/null && command -v iconutil >/dev/null || die "needs macOS sips + iconutil"
check_png() {
  local f="$1" w h fmt alpha
  [[ -f "$f" ]] || die "missing $f"
  fmt=$(sips -g format "$f" | awk '/format/{print $2}'); [[ "$fmt" == png ]] || die "$f is not a PNG ($fmt)"
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}'); h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  [[ "$w" == 1024 && "$h" == 1024 ]] || die "$f must be 1024x1024 (got ${w}x${h})"
  alpha=$(sips -g hasAlpha "$f" | awk '/hasAlpha/{print $2}')
  [[ "$alpha" == yes ]] || echo "warning: $f has no alpha channel (macOS icons are usually transparent outside the shape)" >&2
}
check_png "$SRC"; [[ -n "$DOC" ]] && check_png "$DOC"; [[ -n "$DISK" ]] && check_png "$DISK"
DOC="${DOC:-$SRC}"; DISK="${DISK:-$SRC}"
mkdir -p "$OUT/content"
resize() { sips -s format png -z "$2" "$2" "$1" --out "$3" >/dev/null; }
make_icns() {  # <src.png> <name>
  local set="$OUT/$2.iconset"; rm -rf "$set"; mkdir -p "$set"
  for s in 16 32 128 256 512; do
    resize "$1" "$s" "$set/icon_${s}x${s}.png"
    resize "$1" $((s * 2)) "$set/icon_${s}x${s}@2x.png"
  done
  iconutil -c icns "$set" -o "$OUT/$2.icns"
}
make_icns "$SRC" firefox
make_icns "$DOC" document
make_icns "$DISK" disk
for s in 16 22 24 32 48 64 128 256; do resize "$SRC" "$s" "$OUT/default${s}.png"; done
resize "$SRC" 192 "$OUT/content/about-logo.png"; resize "$SRC" 384 "$OUT/content/about-logo@2x.png"
cp "$OUT/content/about-logo.png" "$OUT/content/about-logo-private.png"
cp "$OUT/content/about-logo@2x.png" "$OUT/content/about-logo-private@2x.png"
# verify: icns round-trip has all 10 slots; PNG sizes exact
for n in firefox document disk; do
  t=$(mktemp -d); iconutil -c iconset "$OUT/$n.icns" -o "$t/x.iconset"
  c=$(ls "$t/x.iconset" | wc -l | tr -d ' '); rm -rf "$t"; [[ "$c" == 10 ]] || die "$n.icns has $c slots (want 10)"
done
for s in 16 22 24 32 48 64 128 256; do
  [[ $(sips -g pixelWidth "$OUT/default${s}.png" | awk '/pixelWidth/{print $2}') == "$s" ]] || die "default${s}.png size"
done
FILES=(firefox.icns document.icns disk.icns default16.png default22.png default24.png default32.png default48.png
       default64.png default128.png default256.png content/about-logo.png content/about-logo@2x.png
       content/about-logo-private.png content/about-logo-private@2x.png)
( cd "$OUT" && shasum -a 256 "${FILES[@]}" ) > "$OUT/SHA256SUMS"
echo "Generated in $OUT:"; ( cd "$OUT" && ls -la "${FILES[@]}" )
if [[ $INSTALL == 1 ]]; then
  if [[ -z "${DARKSTR_BRANDING_DIR:-}" ]]; then source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"; fi
  BR="${DARKSTR_BRANDING_DIR:-${DARKSTR_GECKO_ROOT}/browser/branding/darkstr}"; [[ -d "$BR" ]] || die "no $BR (apply pin 0045 first)"
  mkdir -p "$OUT/replaced-originals/content"
  for f in "${FILES[@]}"; do
    [[ -f "$OUT/replaced-originals/$f" ]] || cp -p "$BR/$f" "$OUT/replaced-originals/$f"
    cp -f "$OUT/$f" "$BR/$f"
  done
  echo "Installed into $BR (originals in $OUT/replaced-originals/)."
  echo "Next: MOZ_OBJDIR=<tree>/obj-aarch64-apple-darwin25.6.0 ./mach build; stage-package; then ./mach package."
  echo "      macOS caches icons: check a fresh copy of the .app (or touch the bundle) when verifying."
else
  echo "Not installed (wolf left in place). Re-run with --install when the PM PNG is final."
fi
