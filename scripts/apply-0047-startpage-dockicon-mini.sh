#!/usr/bin/env bash
# darkstr 0047 apply: start-page branding + full-bleed Dock icon (Assets.car). Run on the Mini.
# usage: scripts/apply-0047-startpage-dockicon-mini.sh   (needs DARKSTR_GECKO_ROOT; 0045 + 0046 applied)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0047-files"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
B="$DARKSTR_GECKO_ROOT/browser/branding/darkstr"
[[ -d "$B/content" ]] || { echo "error: $B missing (apply 0045 first)" >&2; exit 1; }
(cd "$F/startpage" && shasum -a 256 -c <(grep -v 'not vendored' SHA256SUMS))
(cd "$F/icon-fullbleed" && shasum -a 256 -c <(grep -v 'not vendored' SHA256SUMS))
for n in about-logo about-logo-private; do
  cp "$F/startpage/about-logo.png" "$B/content/$n.png"; cp "$F/startpage/about-logo@2x.png" "$B/content/$n@2x.png"
done
cp "$F/icon-fullbleed/Assets.car" "$B/Assets.car"
"$HERE/scripts/darkstr-icon-from-png.sh" "$F/icon-fullbleed/icon-e-fullbleed.png" "${TMPDIR:-/tmp}/darkstr-0047-icons" \
  --small "$F/icon-fullbleed/icon-e-fullbleed-heavy.png" --iconset "$F/icon-fullbleed/darkstr-fullbleed.iconset"
cp "${TMPDIR:-/tmp}/darkstr-0047-icons/firefox.icns" "$B/firefox.icns"   # only firefox.icns; 0046 document/disk/default*.png kept
cd "$DARKSTR_GECKO_ROOT" && patch -p1 --forward < "$HERE/patches/0047-darkstr-startpage-dockicon.patch"
echo "0047 applied. Build: MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && ./mach package"
