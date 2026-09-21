#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 optional pin — apply/refresh 0023 WebGL cap buckets + OffscreenCanvas
# window parity on top of 0017/0019 DepthHooksChild.
# Carries pin 1 install-dist_bin + pin 2 waiveXrays / pageshow / getPrefType lessons.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0023-darkstr-depth-webgl-caps-offscreencanvas.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"

# Prefer unified apply when markers absent; else patch --forward.
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
fi

grep -Fq 'GL_CAP_BUCKETS' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'getCapBucket' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'OffscreenCanvas' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'convertToBlob' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'Cu.waiveXrays' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'installAudioInPage' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'pageshow' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'darkstr.depth.lastError' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq '_readPersonaSeedPref' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"

cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

# Subdirectory build may skip MOZ_SRC install — force dist_bin + app mirror.
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
for mod in DarkstrDepthHooks.sys.mjs DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooksParent.sys.mjs; do
  test -e "${BIN_DIR}/${mod}"
  if [[ ! -e "${APP_DIR}/${mod}" ]]; then
    ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
  fi
  test -e "${APP_DIR}/${mod}"
done
echo "Markers: GL_CAP_BUCKETS + OffscreenCanvas convertToBlob in DepthHooksChild + dist/bin + LibreWolf.app. Check about:config darkstr.depth.lastInstall / lastError. Hooks remain default-off. Ext lists / shader precision / fail-closed getParameter NOT claimed."
