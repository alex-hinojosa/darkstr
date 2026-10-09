#!/usr/bin/env bash
# darkstr 0057c apply: ModeXor re-matches browser.contentblocking.category after Pollution.
#  - Entering Pollution also records the category ({user,value}) in darkstr.xor.savedPrefs.
#  - Leaving: the idle restore pass puts the pre-Pollution category (strict/standard) back when it is
#    still the "custom" Pollution's FPP=false caused and every category pref fits again; set under
#    ContentBlockingPrefs.switchingCategory so no pref is rewritten. Then the ETP flag is restored.
#    Stock never flips "custom" back at runtime (prefsMatch rejects a differing category), so before
#    0057c only a restart (librewolf.cfg pref()) returned to strict.
# Needs 0057 (r2) applied; stacks with 0057b (patches/0058-files, snapshot platform). Chrome JS only.
# usage: scripts/apply-0057c-cb-category-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0057c-files"
PATCH="$HERE/patches/0057c-darkstr-cb-category-rematch.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0057c already applied — tree matches patches/0057c-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0057r2 baseline 0057c was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0057c-files after apply" >&2; exit 1; }
done
grep -Fq '_rematchCBCategory' "$R/browser/components/DarkstrModeXor.sys.mjs"
echo "0057c applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
