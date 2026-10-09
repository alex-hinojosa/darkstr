#!/usr/bin/env bash
# darkstr 0054 apply (Fable B6): Pollution requires native persona hooks.
#  - DarkstrModeXor: darkstr.mode=pollution with darkstr.nativePersonaHooks=false is refused before any
#    RFP / FPP write (_refusePollution(): mode back to Homogeneous, saved RFP / FPP restored), at startup and
#    on every mode / hooks / Native-Compatible change. RFP is never off without a persona, except the
#    documented Native-Compatible escape (Pollution + hooks + nativeCompatible).
#  - Settings pane (config/darkstr.mjs): choosing Pollution turns hooks on before writing the mode; leaving
#    clears them; the hooks checkbox is display-only. preferences.ftl: hooks description.
# Chrome JS + ftl only. Needs main (0057c ModeXor, 0044 pane).
# usage: scripts/apply-0054-pollution-requires-hooks-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0054-files"
PATCH="$HERE/patches/0054-darkstr-pollution-requires-hooks.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs"
 "darkstr.mjs:browser/components/preferences/config/darkstr.mjs"
 "preferences.ftl:browser/locales/en-US/browser/preferences/preferences.ftl"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0054 already applied — tree matches patches/0054-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the main (0057c ModeXor + 0044 pane) baseline 0054 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0054-files after apply" >&2; exit 1; }
done
grep -Fq '_refusePollution()' "$R/browser/components/DarkstrModeXor.sys.mjs"
grep -Fq 'Services.prefs.setBoolPref("darkstr.nativePersonaHooks", true);' "$R/browser/components/preferences/config/darkstr.mjs"
echo "0054 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
