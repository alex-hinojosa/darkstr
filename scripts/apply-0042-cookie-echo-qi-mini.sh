#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 soft residual 0042 — Cookie firewall /echo Cookie QI fix (chrome JS).
# Extends 0035: QI http-on-modify-request subject to nsIHttpChannel; surface set errors.
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0042-darkstr-cookie-echo-qi.patch"
SOT="${REPO}/patches/0042-files/DarkstrCookieFirewall.sys.mjs"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
TARGET="${COMP}/DarkstrCookieFirewall.sys.mjs"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
test -f "${SOT}"

if grep -Fq 'Soft residual (0042)' "${TARGET}" 2>/dev/null \
  && grep -Fq 'QueryInterface(Ci.nsIHttpChannel)' "${TARGET}" 2>/dev/null \
  && grep -Fq 'lastCookieOut' "${TARGET}" 2>/dev/null; then
  echo "0042 markers already present — skip patch apply"
else
  if cp "${SOT}" "${TARGET}"; then
    echo "0042 SoT copied → ${TARGET}"
  else
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
  fi
fi
grep -Fq 'Soft residual (0042)' "${TARGET}"
grep -Fq 'QueryInterface(Ci.nsIHttpChannel)' "${TARGET}"
grep -Fq 'lastCookieOut' "${TARGET}"
grep -Fq 'lastCookieSet' "${TARGET}"
grep -Fq 'lastCookieErr' "${TARGET}"

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
for mod in DarkstrCookieFirewall.sys.mjs \
           DarkstrCookieFirewallChild.sys.mjs \
           DarkstrCookieFirewallParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done
echo "0042 installed. Proof soft: Pollution+hooks+enabled; /set then fetch /echo"
echo "  → Cookie request header carries sandbox synthetic (not empty / not NETWORK_REAL);"
echo "  lastCookieOut == lastCookieSet; lastCookieErr empty; idle when enabled=false."
