#!/usr/bin/env bash
# darkstr 0057 apply (Fable B2): depth farbling seeded per site.
#  - DepthHooks arms on Pollution + hooks + per-site rotation on the 0056 seed store (no global
#    darkstr.persona.seed needed; that pref / a snapshot stay the deterministic Proof path).
#  - per-(container, site) canvas / audio / WebGL readPixels / fonts / WebGPU seeds from the store,
#    shared by the page, same-site frames and workers; stable across reload + restart.
#  - DepthHooksChild: sync seed pull at DOMWindowCreated (no native first read); canvas noise keyed by
#    absolute surface pixel, opaque pixels only (getImageData full/sub-rect, toDataURL, toBlob,
#    OffscreenCanvas convertToBlob, WebGL readPixels with GL row flip all agree); getFloatFrequencyData
#    offset by 20*log10(fudge) (consistent with the scaled signal).
#  - seeds resolved for the requesting document's own WindowGlobalParent (sync pull + DepthHooksParent),
#    not bc.currentWindowGlobal (still the previous / initial about:blank document at DOMWindowCreated).
#  - WorkerHooksChild prelude: same rect noise + readPixels flip + OffscreenCanvas measureText fudge.
# Needs 0052 + 0053 + 0053r2 + 0055r2 + 0056r2 applied. Chrome JS only (no C++).
# usage: scripts/apply-0057-depth-per-site-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0057-files"
PATCH="$HERE/patches/0057-darkstr-depth-per-site.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
 "DarkstrDepthHooksChild.sys.mjs:browser/components/DarkstrDepthHooksChild.sys.mjs"
 "DarkstrDepthHooksParent.sys.mjs:browser/components/DarkstrDepthHooksParent.sys.mjs"
 "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
 "DarkstrWorkerHooks.sys.mjs:browser/components/DarkstrWorkerHooks.sys.mjs"
 "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
[[ -e "$R/browser/components/DarkstrPersonaSeedStore.sys.mjs" ]] \
  || { echo "error: 0056 (DarkstrPersonaSeedStore) is not applied" >&2; exit 1; }
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0057 already applied — tree matches patches/0057-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0056r2 baseline 0057 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0057-files after apply" >&2; exit 1; }
done
grep -Fq 'DarkstrDepthHooks:GetSeedsSync' "$R/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'this.manager' "$R/browser/components/DarkstrDepthHooksParent.sys.mjs"
grep -Fq '_storeSeedForEtld' "$R/browser/components/DarkstrNativePersona.sys.mjs"
echo "0057 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
