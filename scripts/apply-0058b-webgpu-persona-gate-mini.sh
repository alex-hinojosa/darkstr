#!/usr/bin/env bash
# darkstr 0058b apply (WebGPU persona gate): on an Apple-silicon host a non-Apple persona has no WebGPU.
#  - C++: Instance::PrefEnabled(cx, obj) = PrefEnabled() && !DarkstrNavigatorHooks::WebGpuHiddenFor(obj).
#    Every WebGPU WebIDL member (navigator.gpu on Navigator / WorkerNavigator, GPU* interfaces,
#    GPUUncapturedErrorEvent) is Func-gated on it, so a hidden global has exactly the shape of stock
#    dom.webgpu.enabled=false. canvas.getContext("webgpu") returns null on a hidden global.
#  - Main thread: one decision per inner window (sync parent resolve, cached; cleared on
#    inner-window-destroyed). Workers: the persona bag carries hideWebGpu.
#  - Apple personas: WebGPU passthrough (native adapter / GPUAdapterInfo / features / limits).
#  - Intel adapter architecture is a Mac-real generation (gen-9 / gen-11), not gen-12lp.
# Needs 0057 (r4), 0058 (0057b snapshot platform), 0057c and 0058fp applied. C++ + chrome JS.
# usage: scripts/apply-0058b-webgpu-persona-gate-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0058b-files"
PATCH="$HERE/patches/0058b-darkstr-webgpu-persona-gate.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrDepthHooksChild.sys.mjs:browser/components/DarkstrDepthHooksChild.sys.mjs"
 "DarkstrWorkerHooks.sys.mjs:browser/components/DarkstrWorkerHooks.sys.mjs"
 "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
 "DarkstrNavigatorHooks.h:dom/base/DarkstrNavigatorHooks.h"
 "DarkstrNavigatorHooks.cpp:dom/base/DarkstrNavigatorHooks.cpp"
 "Instance.h:dom/webgpu/Instance.h"
 "Instance.cpp:dom/webgpu/Instance.cpp"
 "CanvasRenderingContextHelper.cpp:dom/canvas/CanvasRenderingContextHelper.cpp"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0058b already applied — tree matches patches/0058b-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0057r4 + 0058 + 0057c + 0058fp baseline 0058b was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0058b-files after apply" >&2; exit 1; }
done
grep -Fq 'DarkstrNavigatorHooks::WebGpuHiddenFor' "$R/dom/webgpu/Instance.cpp"
grep -Fq 'bool DarkstrNavigatorHooks::WebGpuHiddenFor' "$R/dom/base/DarkstrNavigatorHooks.cpp"
grep -Fq 'WEBGPU_GATE_TOPIC' "$R/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'depthSeedsForBrowsingContext(bc, docWgp)' "$R/browser/components/DarkstrWorkerHooks.sys.mjs"
for m in DarkstrDepthHooksChild DarkstrWorkerHooksChild; do
  grep -Fq 'if (PERSONA_INFO.vendor === "apple") { return hooks; }' "$R/browser/components/$m.sys.mjs"
  grep -Fq 'architecture: intelArchitecture(r)' "$R/browser/components/$m.sys.mjs"
done
echo "0058b applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
