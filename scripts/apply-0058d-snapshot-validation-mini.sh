#!/usr/bin/env bash
# darkstr 0058d apply (Fable follow-ups to 0058c), chrome JS only:
#  (a) DarkstrNativePersona: a pasted darkstr.persona.snapshot that fails validateSnapshot() (no userAgent,
#      not JSON, not a browser UA, bad field types, unknown timezone) is refused with a console warning
#      and the seeded per-site persona applies (fixed test seed: the seed persona) -- never native.
#  (b) DarkstrDepthHooks: seedless-snapshot depth seeds are mixed with the site's 0056 store seed
#      (eTLD+1 + persona context): one navigator identity / GPU, depth noise per site, stable per site.
#  (c) DarkstrModeXor: getDiagnostics() carries darkstr.xor.lastRefusal + darkstr.xor.refusalCount
#      (prefs.js only while darkstr.debug.diagPrefs is on).
# Needs main with 0058fp, 0058c and 0054 applied (patches/STACK). usage: needs DARKSTR_GECKO_ROOT.
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0058d-files"
PATCH="$HERE/patches/0058d-darkstr-snapshot-validation.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
 "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
 "DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0058d already applied — tree matches patches/0058d-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the main (0058fp + 0058c + 0054) baseline 0058d was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0058d-files after apply" >&2; exit 1; }
done
grep -Fq 'export function validateSnapshot(raw)' "$R/browser/components/DarkstrNativePersona.sys.mjs"
grep -Fq 'export function mixSiteDepthSeed(snapSeed, siteSeed)' "$R/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'diagPrefs.setIntPref(REFUSAL_COUNT_PREF, this._refusals);' "$R/browser/components/DarkstrModeXor.sys.mjs"
grep -Fq "// 0059 (Fable B7): no \`matches\`" "$R/browser/components/DarkstrDepthHooks.sys.mjs"
echo "0058d applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
