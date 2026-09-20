#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 pin 2 — apply 0017 depth canvas/WebGL/Audio + incremental browser/components build.
# Carries pin 1 install-dist_bin lesson (subdirectory mach alone can skip new MOZ_SRC).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0017-darkstr-depth-canvas-webgl-audio.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksParent.sys.mjs"
grep -Fq 'DarkstrDepthHooks' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs"
cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

# Subdirectory build compiles/wires BrowserGlue but may NOT install new MOZ_SRC
# files into dist. Force dist_bin install, then mirror into LibreWolf.app.
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
echo "Markers: DarkstrDepthHooks* in source + dist/bin + LibreWolf.app. Hooks remain default-off. Workers not claimed."
