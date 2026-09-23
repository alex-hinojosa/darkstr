#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 4 soft residual (0030) — sticky persona seed per eTLD+1.
# Chrome JS only — no XUL relink required.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0030-darkstr-persona-etld-seed-rotate.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
CFG="${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"
if grep -Fq 'Soft residual (0030)' "${COMP}/DarkstrNativePersona.sys.mjs" \
  && grep -Fq '_rotationLocked' "${COMP}/DarkstrNativePersona.sys.mjs" \
  && grep -Fq 'resolveSnapshotForUri' "${COMP}/DarkstrNativePersona.sys.mjs" \
  && grep -Fq 'Soft residual (0030)' "${COMP}/DarkstrNativePersonaParent.sys.mjs"; then
  echo "0030 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'Soft residual (0030)' "${COMP}/DarkstrNativePersona.sys.mjs"
grep -Fq '_rotationLocked' "${COMP}/DarkstrNativePersona.sys.mjs"
grep -Fq 'resolveSnapshotForUri' "${COMP}/DarkstrNativePersona.sys.mjs"
grep -Fq 'Soft residual (0030)' "${COMP}/DarkstrNativePersonaParent.sys.mjs"

# Idempotent cfg default for rotatePerSite (JS also defaults true).
MARKER_BEGIN="// BEGIN darkstr-0030-etld-rotate"
MARKER_END="// END darkstr-0030-etld-rotate"
if [[ -f "${CFG}" ]] && ! grep -Fq "${MARKER_BEGIN}" "${CFG}"; then
  {
    echo ""
    echo "${MARKER_BEGIN}"
    echo "// Sticky per-eTLD+1 seed under Pollution+hooks. Proof: snapshot paste OR rotatePerSite=false."
    echo 'defaultPref("darkstr.persona.rotatePerSite", true);'
    echo "${MARKER_END}"
  } >> "${CFG}"
  echo "Appended 0030 rotatePerSite defaultPref to lw/librewolf.cfg"
else
  echo "lw/librewolf.cfg 0030 block present or missing cfg — skip"
fi

# Sync darkstr.cfg from repo stub when present.
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
for mod in DarkstrNativePersona.sys.mjs DarkstrNativePersonaParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
done
# Also ensure dist/bin moz-src symlink (marionette / non-app path).
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
mkdir -p "${BIN_DIR}"
for mod in DarkstrNativePersona.sys.mjs DarkstrNativePersonaParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done
echo "0030 installed. Proof gates: two https eTLD+1 → different darkstr.persona.effectiveSeed;"
echo "  two tabs same eTLD+1 → same effectiveSeed; seed=42 + rotatePerSite=false (or snapshot) → golden."
