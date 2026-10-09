#!/usr/bin/env bash
# darkstr 0058 apply (first-page policy, Fable B4): the persona decision is per site, not per tab.
#  - NativePersona: strictNextNavArmed() is armed for every document while Pollution + hooks are on;
#    the per-tab strictFirstDoc native hold is gone (darkstr.strictFirstDoc is no longer read). The
#    first document of every new tab, after a cold start and after a restart gets the site's persona
#    over HTTP (UA / Accept-Language), JS, workers and depth noise, like later pages.
#  - Startup: the 0056 seed-store hold covers the first loads; _noteTopLevelDocument no longer resolves
#    a snapshot while the store is loading (it would hand out a session-random seed).
#  - Native-Compatible (darkstr.nativeCompatible) and off mode stay fully native.
# Needs 0057b (patches/0058-files, snapshot platform) applied. Chrome JS only.
# Naming: patches/0058-files is 0057b; this pin's files are patches/0058fp-files.
# usage: scripts/apply-0058fp-first-page-policy-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0058fp-files"
PATCH="$HERE/patches/0058fp-darkstr-first-page-policy.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0058 (first-page policy) already applied — tree matches patches/0058fp-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0057b baseline 0058 (first-page policy) was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0058fp-files after apply" >&2; exit 1; }
done
grep -Fq 'strictNextNavArmed(_phase)' "$R/browser/components/DarkstrNativePersona.sys.mjs"
if grep -Fq 'getBoolPref(STRICT_PREF' "$R/browser/components/DarkstrNativePersona.sys.mjs"; then
  echo "error: per-tab strictFirstDoc hold still present" >&2; exit 1
fi
echo "0058 (first-page policy) applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
