#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 soft residual 0039 — FontFaceSet enumeration coherence (chrome JS).
# Extends 0036: values/keys/entries/forEach/@@iterator/size/load; ready untouched.
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0039-darkstr-fonts-enum-coherence.patch"
SOT="${REPO}/patches/0039-files/DarkstrDepthHooksChild.sys.mjs"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
TARGET="${COMP}/DarkstrDepthHooksChild.sys.mjs"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
test -f "${SOT}"

if grep -Fq 'Soft residual (0039)' "${TARGET}" 2>/dev/null \
  && grep -Fq 'keptFromThis' "${TARGET}" 2>/dev/null \
  && grep -Fq 'makeFaceIterator' "${TARGET}" 2>/dev/null; then
  echo "0039 markers already present — skip patch apply"
else
  # Prefer SoT copy (full module; avoids fragile mid-Function hunks), fallback patch
  if cp "${SOT}" "${TARGET}"; then
    echo "0039 SoT copied → ${TARGET}"
  else
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
  fi
fi
grep -Fq 'Soft residual (0039)' "${TARGET}"
grep -Fq 'keptFromThis' "${TARGET}"
grep -Fq 'makeFaceIterator' "${TARGET}"
grep -Fq 'FIREFOX_BASELINE' "${TARGET}"
grep -Fq 'shouldHideFamily' "${TARGET}"

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
for mod in DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooks.sys.mjs DarkstrDepthHooksParent.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done
echo "0039 installed. Proof gates: hooks-off/Homogeneous → idle host FontFaceSet;"
echo "  Pollution+hooks: enumeration digests coherent with fonts.check (same hide);"
echo "  double-read stable; rotatePerSite eTLD diverge; same eTLD two tabs → same;"
echo "  seed-42 golden; no Chrome-only families; ready remains host Promise."
