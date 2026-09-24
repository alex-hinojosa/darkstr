#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 4 soft residual (0033) — page-compartment navigator.languages (cloneInto).
# Chrome JS only — no XUL relink required. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0033-darkstr-nav-languages-cloneinto.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"
if grep -Fq 'Soft residual (0033)' "${COMP}/DarkstrNativePersonaChild.sys.mjs" \
  && grep -Fq 'Cu.cloneInto(langsCopy.slice()' "${COMP}/DarkstrNativePersonaChild.sys.mjs"; then
  echo "0033 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'Soft residual (0033)' "${COMP}/DarkstrNativePersonaChild.sys.mjs"
grep -Fq 'Cu.cloneInto(langsCopy.slice()' "${COMP}/DarkstrNativePersonaChild.sys.mjs"

cd "${DARKSTR_GECKO_ROOT}"
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_MACH_SITE=1
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_BUILD_SITE=1
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=system
PATH="/usr/bin:${PATH}" ./mach build --allow-subdirectory-build browser/components
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
mkdir -p "${APP_DIR}"
ln -sfn "${COMP}/DarkstrNativePersonaChild.sys.mjs" "${APP_DIR}/DarkstrNativePersonaChild.sys.mjs"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
mkdir -p "${BIN_DIR}"
ln -sfn "${COMP}/DarkstrNativePersonaChild.sys.mjs" "${BIN_DIR}/DarkstrNativePersonaChild.sys.mjs"
echo "0033 installed. Expect: Pollution SubsequentNav page navigator.languages includes snapshot es;"
echo "  worker langs still OK; Marionette direct .length may still Xray-deny (use page/attr probe)."
