#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 pin 1 — apply 0016 chaff native scheduler + incremental browser/components build.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0016-darkstr-chaff-native-scheduler.patch"
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
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'DarkstrChaffScheduler' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs"
cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

# Subdirectory build compiles/wires BrowserGlue but may NOT install new MOZ_SRC
# files into dist. Force dist_bin install, then mirror into LibreWolf.app.
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
SRC="${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
BIN="${OBJ}/dist/bin/moz-src/browser/components/DarkstrChaffScheduler.sys.mjs"
APP="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components/DarkstrChaffScheduler.sys.mjs"
test -e "${BIN}"
# App Resources is a parallel tree (not always refreshed by install-dist_bin)
if [[ ! -e "${APP}" ]]; then
  ln -sf "${SRC}" "${APP}"
fi
test -e "${APP}"
echo "Markers: DarkstrChaffScheduler in source + dist/bin + LibreWolf.app. Hooks remain default-off."
