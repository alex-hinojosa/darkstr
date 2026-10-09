#!/usr/bin/env bash
# darkstr 0058c apply (Proof #95 note): the 0058b WebGPU gate keys on the persona's OS *and* GPU vendor.
# On an Apple-silicon host only a macOS persona with an Apple GPU sees WebGPU; Windows / Linux personas
# (seeded or a pasted snapshot) get the stock dom.webgpu.enabled=false shape, never the Apple adapter.
# Pasted Windows / Linux snapshots also get an OS-coherent WebGL GPU (DarkstrDepthHooks personaGpu: the snapshot's
# own GPU only when coherent with its OS, else a bucketed default of that OS + a warning).
# Chrome JS only (DarkstrWorkerHooksChild: isMacPersona + webGpuHiddenFor; DarkstrDepthHooks). Needs 0058b applied.
# usage: scripts/apply-0058c-webgpu-gate-os-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0058c-files"
PATCH="$HERE/patches/0058c-darkstr-webgpu-gate-os.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
 "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0058c already applied — tree matches patches/0058c-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0058b baseline 0058c was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0058c-files after apply" >&2; exit 1; }
done
grep -Fq 'export function isMacPersona(persona)' "$R/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'if (result.persona && !isMacPersona(result.persona))' "$R/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'export function personaGpu(snap, gpu, seed, { useOwn = true } = {})' "$R/browser/components/DarkstrDepthHooks.sys.mjs"
echo "0058c applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
