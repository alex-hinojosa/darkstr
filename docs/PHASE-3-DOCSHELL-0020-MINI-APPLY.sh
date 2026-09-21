#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 — DocShell SubsequentNav / strict-next-nav arm (0020), extends M3 0006/0007.
# Carries pin 1 install-dist_bin lesson + pin 2 module-refresh for chrome modules.
# C++ rebuild: docshell/base dom/base netwerk/protocol/http
# Chrome rebuild: browser/components + make install-dist_bin
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0020-darkstr-docshell-strict-next-nav.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

# Marker skip when already applied
if grep -Fq 'StrictNextNavArmed' "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h" \
  && grep -Fq 'darkstr.docshell.strictNextNavArmed' "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.cpp" \
  && grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp" \
  && grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/DarkstrNsHttpHooks.cpp" \
  && grep -Fq 'strictNextNavArmed' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
  && grep -Fq 'SubsequentNav arm' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs" \
  && grep -Fq 'nextNavOk' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"; then
  echo "0020 strict-next-nav markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
rm -f "${DARKSTR_GECKO_ROOT}/browser/components/"*.rej \
  "${DARKSTR_GECKO_ROOT}/docshell/base/"*.rej \
  "${DARKSTR_GECKO_ROOT}/dom/base/"*.rej \
  "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/"*.rej

grep -Fq 'StrictNextNavArmed' "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h"
grep -Fq 'darkstr.docshell.strictNextNavArmed' "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.cpp"
grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp"
grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/DarkstrNsHttpHooks.cpp"
grep -Fq 'strictNextNavArmed' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
grep -Fq 'SubsequentNav arm' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'nextNavOk' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"

if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
fi

cd "${DARKSTR_GECKO_ROOT}"
./mach build docshell/base dom/base netwerk/protocol/http
echo "mach C++ EXIT=$?"
./mach build --allow-subdirectory-build browser/components
echo "mach chrome EXIT=$?"

OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
for mod in \
  DarkstrNativePersona.sys.mjs \
  DarkstrDepthHooks.sys.mjs DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooksParent.sys.mjs \
  DarkstrWorkerHooks.sys.mjs DarkstrWorkerHooksChild.sys.mjs DarkstrWorkerHooksParent.sys.mjs; do
  if [[ -f "${COMP}/${mod}" ]]; then
    test -e "${BIN_DIR}/${mod}" || true
    if [[ -d "${APP_DIR}" && ! -e "${APP_DIR}/${mod}" ]]; then
      ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
    fi
  fi
done
echo "Markers: StrictNextNavArmed + darkstr.docshell.strictNextNavArmed + chrome gates."
echo "XOR: Pollution+hooks+strictFirstDoc → first nav native; subsequent → persona/depth/worker."
echo "Default / Homogeneous / hooks off → idle. No privacy.* from 0020."
echo "Hooks remain default-off. Mini apply from this helper; Proof XOR = parent/operator."
