#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 soft residual (0029) — enable live WebGL context (LibreWolf hardening undo).
# Chrome JS only — no XUL relink required.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0029-darkstr-webgl-context-enable.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
LW_CFG="${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"
if grep -Fq 'Soft residual (0029)' "${COMP}/DarkstrModeXor.sys.mjs" \
  && grep -Fq '_ensureWebGlContextPrefs' "${COMP}/DarkstrModeXor.sys.mjs"; then
  echo "0029 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'Soft residual (0029)' "${COMP}/DarkstrModeXor.sys.mjs"
grep -Fq '_ensureWebGlContextPrefs' "${COMP}/DarkstrModeXor.sys.mjs"

# Product cfg: ensure LibreWolf baseline does not leave webgl.disabled locked on.
if [[ -f "${LW_CFG}" ]]; then
  if ! grep -Fq 'darkstr-0029-webgl' "${LW_CFG}"; then
    cat >> "${LW_CFG}" << 'CFG'

// BEGIN darkstr-0029-webgl — Firefox-coherent WebGL (undo LibreWolf null-context hardening)
unlockPref("webgl.disabled");
defaultPref("webgl.disabled", false);
unlockPref("webgl.force-enabled");
defaultPref("webgl.force-enabled", true);
// END darkstr-0029-webgl
CFG
    echo "Appended darkstr-0029-webgl block to lw/librewolf.cfg"
  else
    echo "lw/librewolf.cfg already has darkstr-0029-webgl — skip"
  fi
fi

# Refresh darkstr.cfg copy if present
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
mkdir -p "${APP_DIR}"
ln -sfn "${COMP}/DarkstrModeXor.sys.mjs" "${APP_DIR}/DarkstrModeXor.sys.mjs"
# Also ensure packaged librewolf.cfg carries the 0029 block (dist Resources).
DIST_CFG="${OBJ}/dist/LibreWolf.app/Contents/Resources/librewolf.cfg"
if [[ -f "${LW_CFG}" && -d "$(dirname "${DIST_CFG}")" ]]; then
  cp "${LW_CFG}" "${DIST_CFG}" || true
fi
echo "0029 installed. Proof: Homogeneous + Pollution getContext('webgl') non-null; Pollution+hooks SubsequentNav UNMASKED Apple / apple caps; darkstr.webgl.ensureApplied=true."
