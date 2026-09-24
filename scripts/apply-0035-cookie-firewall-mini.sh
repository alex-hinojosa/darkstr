#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 pin 0035 — Cookie firewall MVP (chrome JS; shared HTTP+script policy).
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0035-darkstr-cookie-firewall.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
CFG="${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"

if grep -Fq 'Phase 5 pin 0035' "${COMP}/DarkstrCookieFirewall.sys.mjs" 2>/dev/null \
  && grep -Fq 'darkstr.cookieFirewall.enabled' "${COMP}/DarkstrCookieFirewall.sys.mjs" 2>/dev/null; then
  echo "0035 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'darkstr.cookieFirewall.enabled' "${COMP}/DarkstrCookieFirewall.sys.mjs"
test -f "${COMP}/DarkstrCookieFirewallChild.sys.mjs"
test -f "${COMP}/DarkstrCookieFirewallParent.sys.mjs"

# Idempotent cfg defaults (default-off).
MARKER_BEGIN="// BEGIN darkstr-0035-cookie-firewall"
MARKER_END="// END darkstr-0035-cookie-firewall"
if [[ -f "${CFG}" ]] && ! grep -Fq "${MARKER_BEGIN}" "${CFG}"; then
  {
    echo ""
    echo "${MARKER_BEGIN}"
    echo "// Cookie firewall MVP — default OFF. Arms only under Pollution+hooks+enabled."
    echo 'defaultPref("darkstr.cookieFirewall.enabled", false);'
    echo 'defaultPref("darkstr.cookieFirewall.mode", "synthetic");'
    echo 'defaultPref("darkstr.cookieFirewall.allowlist", "");'
    echo "${MARKER_END}"
  } >> "${CFG}"
  echo "Appended 0035 cookieFirewall defaults to lw/librewolf.cfg"
else
  echo "lw/librewolf.cfg 0035 block present or missing cfg — skip"
fi

if [[ -f "${REPO}/patches/stubs/darkstr.cfg" ]]; then
  cp "${REPO}/patches/stubs/darkstr.cfg" "${DARKSTR_GECKO_ROOT}/lw/darkstr.cfg"
fi

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
echo "0035 installed. Proof gates: hooks-off/enabled=false → real cookies idle;"
echo "  Pollution+hooks+enabled → document.cookie + CookieStore share policy with HTTP;"
echo "  two eTLD+1 → isolated/different synthetic; same eTLD two tabs → same seed;"
echo "  golden lock seed-42 still coherent."
