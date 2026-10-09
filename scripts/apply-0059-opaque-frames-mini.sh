#!/usr/bin/env bash
# darkstr 0059 apply (Fable B7): opaque-origin frames take their top-level site's persona.
#  - sandbox without allow-same-origin, data:, blob: from an opaque origin, srcdoc in a sandbox (nested too):
#    navigator (DarkstrNativePersonaChild isOpaquePersonaDocument), depth noise (DepthHooks actor without
#    `matches`; the child admits the old http(s)/file documents + opaque ones), workers they own and data:
#    workers (C++ ResolveWorkerPersona admits window-owned null principals), WebGPU gate (opaque windows).
#  - Requests and timezone already used the top document's decision; the parent side is unchanged.
# Needs 0058b applied (0057, 0058, 0057c, 0058fp underneath). C++ + chrome JS.
# usage: scripts/apply-0059-opaque-frames-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0059-files"
PATCH="$HERE/patches/0059-darkstr-opaque-frames.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrNativePersonaChild.sys.mjs:browser/components/DarkstrNativePersonaChild.sys.mjs"
 "DarkstrDepthHooksChild.sys.mjs:browser/components/DarkstrDepthHooksChild.sys.mjs"
 "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
 "DarkstrNavigatorHooks.cpp:dom/base/DarkstrNavigatorHooks.cpp"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0059 already applied — tree matches patches/0059-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0058b baseline 0059 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0059-files after apply" >&2; exit 1; }
done
grep -Fq '!isOpaquePersonaDocument(document.nodePrincipal, this.browsingContext)' "$R/browser/components/DarkstrNativePersonaChild.sys.mjs"
grep -Fq 'eligible = depthDocumentEligible(this.document, this.browsingContext);' "$R/browser/components/DarkstrDepthHooksChild.sys.mjs"
! grep -Fq 'matches: ["*://*/*", "file://*"]' "$R/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq '(principal->GetIsNullPrincipal() && aLoadInfo.mWindow)' "$R/dom/base/DarkstrNavigatorHooks.cpp"
echo "0059 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
