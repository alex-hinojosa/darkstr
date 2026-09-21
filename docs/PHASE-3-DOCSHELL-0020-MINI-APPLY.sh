#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 — DocShell SubsequentNav / strict-next-nav arm (0020), extends M3 0006/0007.
# Proof XOR fix: only http(s) count toward FirstDocument (about:blank/newtab ignored).
# Carries pin 1 install-dist_bin + allow-subdir + toolkit/library XUL relink.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0020-darkstr-docshell-strict-next-nav.patch"
UPGRADE="${REPO}/patches/0021-darkstr-docshell-http-scheme-count.patch"
FIX022="${REPO}/patches/0022-darkstr-docshell-browserid-phase.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

DS_H="${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h"
DS_C="${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.cpp"
NP="${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"

if grep -Fq 'BrowserId()' "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp" \
  && grep -Fq '_resetNavPhaseMirror' "${NP}" \
  && grep -Fq 'READ-ONLY' "${NP}" \
  && grep -Fq 'CountsTowardStrictFirstDoc' "${DS_H}" \
  && grep -Fq 'scheme !== "http"' "${NP}"; then
  echo "0022 BrowserId + read-only phase markers already present — skip patch apply"
else
  if ! grep -Fq 'CountsTowardStrictFirstDoc' "${DS_H}"; then
    if grep -Fq 'StrictNextNavArmed' "${DS_H}" && [[ -f "${UPGRADE}" ]]; then
      echo "0020v1 present — apply http-scheme upgrade 0021"
      patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${UPGRADE}"
    else
      echo "Applying full 0020 (SubsequentNav + http-scheme filter)"
      patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
    fi
  fi
  if [[ -f "${FIX022}" ]] && ! grep -Fq 'BrowserId()' "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp"; then
    echo "Applying 0022 BrowserId + read-only chrome phase (Proof XOR fix)"
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${FIX022}"
  fi
fi
rm -f "${DARKSTR_GECKO_ROOT}/browser/components/"*.rej \
  "${DARKSTR_GECKO_ROOT}/docshell/base/"*.rej \
  "${DARKSTR_GECKO_ROOT}/dom/base/"*.rej \
  "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/"*.rej

grep -Fq 'CountsTowardStrictFirstDoc' "${DS_H}"
grep -Fq 'CountsTowardStrictFirstDoc' "${DS_C}"
grep -Fq 'BrowserId()' "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp"
grep -Fq 'aLoadState->URI()' "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp"
grep -Fq 'scheme !== "http"' "${NP}"
grep -Fq '_resetNavPhaseMirror' "${NP}"
grep -Fq 'READ-ONLY' "${NP}"
grep -Fq 'browserId' "${NP}"
grep -Fq 'StrictNextNavArmed' "${DS_H}"
grep -Fq 'darkstr.docshell.strictNextNavArmed' "${DS_C}"
grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp"
grep -Fq 'StrictNextNavArmedMirror' "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/DarkstrNsHttpHooks.cpp"
grep -Fq 'strictNextNavArmed' "${NP}"
grep -Fq 'SubsequentNav arm' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'nextNavOk' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"

if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
fi

cd "${DARKSTR_GECKO_ROOT}"
# Disk ~9 Gi — subdirectory + toolkit/library relink (avoid full rebuild)
./mach build --allow-subdirectory-build docshell/base dom/base netwerk/protocol/http
./mach build --allow-subdirectory-build toolkit/library
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
echo "Markers: BrowserId + read-only phase + CountsTowardStrictFirstDoc + StrictNextNavArmed."
echo "XOR: blank unarmed → first https idle (first_document/UA155) → second https armed (UA140)."
echo "Homogeneous/hooks-off → idle. No privacy.*. Do not clear prefs manually for Proof."
echo "Hooks remain default-off. Mini apply from this helper; Proof XOR = parent/operator."
