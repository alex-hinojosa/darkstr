#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 pin 0038 — WebGPU adapter/device/limits/features coherence (chrome JS).
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0038-darkstr-webgpu-coherence.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

if grep -Fq 'Soft residual (0038)' "${COMP}/DarkstrDepthHooksChild.sys.mjs" 2>/dev/null \
  && grep -Fq 'webgpuSeed' "${COMP}/DarkstrDepthHooks.sys.mjs" 2>/dev/null \
  && grep -Fq 'installWebGpuInPage' "${COMP}/DarkstrDepthHooksChild.sys.mjs" 2>/dev/null \
  && grep -Fq 'sharedFeatCache' "${COMP}/DarkstrDepthHooksChild.sys.mjs" 2>/dev/null; then
  echo "0038 markers already present (incl. sharedFeatCache a↔d fix) — skip patch apply"
else
  # --forward: skips landed hunks if partially present
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
fi
grep -Fq 'Soft residual (0038)' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'webgpuSeed' "${COMP}/DarkstrDepthHooks.sys.mjs"
grep -Fq 'installWebGpuInPage' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'deriveWebGpuSeed' "${COMP}/DarkstrDepthHooks.sys.mjs"
grep -Fq 'wrapAdapter' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'sharedFeatCache' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'wrapDevice(dev, getFeat()' "${COMP}/DarkstrDepthHooksChild.sys.mjs"

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
for mod in DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooks.sys.mjs DarkstrDepthHooksParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done
echo "0038 installed. Proof gates: hooks-off/Homogeneous/pref-off → idle;"
echo "  Pollution+hooks + WebGPU on: same seed → stable adapter digests (double-read);"
echo "  adapter↔device coherent; rotatePerSite eTLD diverge; same eTLD two tabs → same;"
echo "  seed-42 golden lock; no Chrome adapter brands; AdapterInfo ↔ depth gpu family."
echo "  lastSeeds includes webgpuSeed. LibreWolf dom.webgpu.enabled stays default false."
