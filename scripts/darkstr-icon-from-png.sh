#!/usr/bin/env bash
# darkstr: generate macOS branding icons from one 1024x1024 PNG (PM master art).
# Run on the Mac mini (needs sips + iconutil). Default = generate into OUT_DIR only; nothing in
# the Gecko tree changes unless --install is given.
#
# usage: scripts/darkstr-icon-from-png.sh <icon-1024.png> [OUT_DIR] [--install]
#          [--small <png>] [--small-upto <px>] [--iconset <dir>] [--doc <png>] [--disk <png>]
#   OUT_DIR       default: ./darkstr-icons-out
#   --install     copy generated files into ${DARKSTR_GECKO_ROOT}/browser/branding/darkstr (originals
#                 backed up to OUT_DIR/replaced-originals/ first; DARKSTR_BRANDING_DIR overrides target)
#   --small       1024 PNG with heavier lines for small sizes: used for the 16/32 (@1x+@2x) icns slots
#                 and for default*.png up to --small-upto (default 32)
#   --small-upto  largest default<N>.png taken from --small art (e.g. 48)
#   --iconset     PM-supplied .iconset (10 slots) used verbatim for firefox.icns; its icon_16x16 /
#                 icon_32x32 are also used for default16/default32.png
#   --doc         separate 1024 PNG for document.icns (Finder icon for .html/.pdf/etc.); default: master
#   --disk        separate 1024 PNG for disk.icns (DMG volume icon); default: master
#
# Produces (names = what browser/branding/darkstr uses on macOS):
#   firefox.icns   -> darkstr.app/Contents/Resources/firefox.icns (CFBundleIconFile; Dock/Finder/Cmd-Tab)
#   document.icns  -> Contents/Resources/document.icns (CFBundleDocumentTypes icon)
#   disk.icns      -> DMG .VolumeIcon.icns (toolkit/moz.configure --icon)
#   default16/22/24/32/48/64/128/256.png  (16..128 also -> chrome://branding/content/iconNN.png)
#   content/about-logo.png (192), content/about-logo@2x.png (384), and the -private variants
#     (About dialog, about:home / new tab logo, private browsing page) — always from the master
#   *.iconset dirs with the full 16..1024 @1x/@2x set (kept for review)
# Not generated (Windows/MSIX-only, unused on macOS builds): *.ico, VisualElements_*, msix/Assets,
#   wiz*.bmp, PrivateBrowsing_*.png; also content/about.png (300x236 legacy, non-square).
# NOTE: chrome://branding/content is contentaccessible=yes. After --install + build, re-run the
#   web reach probe (0045 harness) and confirm chrome://branding/content/* stays blocked from pages.
set -euo pipefail
die() { echo "error: $*" >&2; exit 1; }
[[ $# -ge 1 ]] || { sed -n '2,24p' "$0"; exit 2; }
SRC="$1"; shift
OUT="./darkstr-icons-out"; INSTALL=0; DOC=""; DISK=""; SMALL=""; SMALL_UPTO=32; ICONSET=""
if [[ $# -gt 0 && "$1" != --* ]]; then OUT="$1"; shift; fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) INSTALL=1 ;;
    --doc) DOC="$2"; shift ;;
    --disk) DISK="$2"; shift ;;
    --small) SMALL="$2"; shift ;;
    --small-upto) SMALL_UPTO="$2"; shift ;;
    --iconset) ICONSET="$2"; shift ;;
    *) die "unknown arg $1" ;;
  esac; shift
done
command -v sips >/dev/null && command -v iconutil >/dev/null || die "needs macOS sips + iconutil"
px() { sips -g "$2" "$1" | awk -v k="$2" '$1==k":"{print $2}'; }
check_png() {  # <file> [size]
  local f="$1" want="${2:-1024}" fmt
  [[ -f "$f" ]] || die "missing $f"
  fmt=$(px "$f" format); [[ "$fmt" == png ]] || die "$f is not a PNG ($fmt)"
  [[ "$(px "$f" pixelWidth)" == "$want" && "$(px "$f" pixelHeight)" == "$want" ]] \
    || die "$f must be ${want}x${want} (got $(px "$f" pixelWidth)x$(px "$f" pixelHeight))"
  [[ "$(px "$f" hasAlpha)" == yes ]] || echo "warning: $f has no alpha channel" >&2
}
check_png "$SRC"; [[ -n "$DOC" ]] && check_png "$DOC"; [[ -n "$DISK" ]] && check_png "$DISK"
[[ -n "$SMALL" ]] && check_png "$SMALL"
[[ "$SMALL_UPTO" =~ ^[0-9]+$ ]] || die "--small-upto needs a number"
if [[ -n "$ICONSET" ]]; then
  [[ -d "$ICONSET" ]] || die "no iconset dir $ICONSET"
  for s in 16 32 128 256 512; do
    check_png "$ICONSET/icon_${s}x${s}.png" "$s"; check_png "$ICONSET/icon_${s}x${s}@2x.png" $((s * 2))
  done
fi
DOC="${DOC:-$SRC}"; DISK="${DISK:-$SRC}"
mkdir -p "$OUT/content"
resize() { sips -s format png -z "$2" "$2" "$1" --out "$3" >/dev/null; }
make_icns() {  # <src.png> <name>   (16/32 slots from --small art when given)
  local set="$OUT/$2.iconset" art; rm -rf "$set"; mkdir -p "$set"
  for s in 16 32 128 256 512; do
    art="$1"; [[ -n "$SMALL" && $s -le 32 ]] && art="$SMALL"
    resize "$art" "$s" "$set/icon_${s}x${s}.png"
    resize "$art" $((s * 2)) "$set/icon_${s}x${s}@2x.png"
  done
  iconutil -c icns "$set" -o "$OUT/$2.icns"
}
if [[ -n "$ICONSET" ]]; then
  rm -rf "$OUT/firefox.iconset"; mkdir -p "$OUT/firefox.iconset"
  cp "$ICONSET"/icon_*.png "$OUT/firefox.iconset/"
  iconutil -c icns "$OUT/firefox.iconset" -o "$OUT/firefox.icns"
else
  make_icns "$SRC" firefox
fi
make_icns "$DOC" document
make_icns "$DISK" disk
for s in 16 22 24 32 48 64 128 256; do
  if [[ -n "$ICONSET" && ( $s == 16 || $s == 32 ) ]]; then
    cp "$ICONSET/icon_${s}x${s}.png" "$OUT/default${s}.png"
  elif [[ -n "$SMALL" && $s -le $SMALL_UPTO ]]; then
    resize "$SMALL" "$s" "$OUT/default${s}.png"
  else
    resize "$SRC" "$s" "$OUT/default${s}.png"
  fi
done
resize "$SRC" 192 "$OUT/content/about-logo.png"; resize "$SRC" 384 "$OUT/content/about-logo@2x.png"
cp "$OUT/content/about-logo.png" "$OUT/content/about-logo-private.png"
cp "$OUT/content/about-logo@2x.png" "$OUT/content/about-logo-private@2x.png"
# verify: icns round-trip has all 10 slots; PNG sizes exact
for n in firefox document disk; do
  t=$(mktemp -d); iconutil -c iconset "$OUT/$n.icns" -o "$t/x.iconset"
  c=$(ls "$t/x.iconset" | wc -l | tr -d ' '); rm -rf "$t"; [[ "$c" == 10 ]] || die "$n.icns has $c slots (want 10)"
done
for s in 16 22 24 32 48 64 128 256; do
  [[ "$(px "$OUT/default${s}.png" pixelWidth)" == "$s" ]] || die "default${s}.png size"
done
FILES=(firefox.icns document.icns disk.icns default16.png default22.png default24.png default32.png default48.png
       default64.png default128.png default256.png content/about-logo.png content/about-logo@2x.png
       content/about-logo-private.png content/about-logo-private@2x.png)
( cd "$OUT" && shasum -a 256 "${FILES[@]}" ) > "$OUT/SHA256SUMS"
echo "Generated in $OUT (master=$(basename "$SRC") small=${SMALL:+$(basename "$SMALL") upto ${SMALL_UPTO}px} iconset=${ICONSET:+$(basename "$ICONSET")}):"
( cd "$OUT" && ls -la "${FILES[@]}" )
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
  echo "Not installed. Re-run with --install when the PM PNG is final."
fi
