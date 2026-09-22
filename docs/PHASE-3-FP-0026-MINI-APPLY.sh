#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 FP HW waiveXrays (0026) — NativePersonaChild page-compartment getters.
# Chrome JS only — no XUL relink required.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0026-darkstr-fp-hw-waivexrays.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"
if grep -Fq 'waiveXrays + exportFunction' "${COMP}/DarkstrNativePersonaChild.sys.mjs"; then
  echo "0026 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'waiveXrays + exportFunction' "${COMP}/DarkstrNativePersonaChild.sys.mjs"
cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
ln -sfn "${COMP}/DarkstrNativePersonaChild.sys.mjs" "${APP_DIR}/DarkstrNativePersonaChild.sys.mjs"
echo "0026 HW waiveXrays installed. Proof XOR: window hardwareConcurrency===8 after SubsequentNav."
