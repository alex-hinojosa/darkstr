#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 soft residual 0043 — Worker/SharedWorker WebGPU coherence (chrome JS).
# Extends 0018 Worker blob + 0038 window WebGPU parity. ServiceWorker still OOS.
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0043-darkstr-webgpu-worker-coherence.patch"
OVERLAY="${REPO}/patches/0043-files"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
test -f "${OVERLAY}/DarkstrWorkerHooks.sys.mjs"
test -f "${OVERLAY}/DarkstrWorkerHooksChild.sys.mjs"

if grep -Fq 'Soft residual (0043)' "${COMP}/DarkstrWorkerHooksChild.sys.mjs" 2>/dev/null \
  && grep -Fq 'buildWebGpuOverrides' "${COMP}/DarkstrWorkerHooksChild.sys.mjs" 2>/dev/null \
  && grep -Fq 'webgpuSeed' "${COMP}/DarkstrWorkerHooks.sys.mjs" 2>/dev/null \
  && grep -Fq 'deriveWebGpuSeed' "${COMP}/DarkstrWorkerHooks.sys.mjs" 2>/dev/null; then
  echo "0043 markers already present — skip apply"
else
  echo "0043 syncing SoT overlay files…"
  cp -f "${OVERLAY}/DarkstrWorkerHooks.sys.mjs" "${COMP}/DarkstrWorkerHooks.sys.mjs"
  cp -f "${OVERLAY}/DarkstrWorkerHooksChild.sys.mjs" "${COMP}/DarkstrWorkerHooksChild.sys.mjs"
fi
grep -Fq 'Soft residual (0043)' "${COMP}/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'Soft residual (0043)' "${COMP}/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'buildWebGpuOverrides' "${COMP}/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'deriveWebGpuSeed' "${COMP}/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'webgpuSeed' "${COMP}/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'WorkerNavigator.gpu' "${COMP}/DarkstrWorkerHooksChild.sys.mjs"

cd "${DARKSTR_GECKO_ROOT}"
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_MACH_SITE=1
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_BUILD_SITE=1
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=system
PATH="/usr/bin:${PATH}" ./mach build --allow-subdirectory-build browser/components
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
mkdir -p "${APP_DIR}" "${BIN_DIR}"
for mod in DarkstrWorkerHooks.sys.mjs \
           DarkstrWorkerHooksChild.sys.mjs \
           DarkstrWorkerHooksParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done
echo "0043 installed. Proof soft: Pollution+hooks + dom.webgpu.enabled;"
echo "  DedicatedWorker navigator.gpu.requestAdapter digests match window 0038"
echo "  (same webgpuSeed / adapter↔device coherent / eTLD diverge);"
echo "  idle when pref-off / Homogeneous / hooks-off; ServiceWorker still OOS;"
echo "  AdapterInfo.device empty (do not invent); no Chrome adapter brands."
