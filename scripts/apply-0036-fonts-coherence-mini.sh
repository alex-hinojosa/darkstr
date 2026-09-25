#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 5 pin 0036 — fonts coherence / fingerprint farbling (chrome JS).
# Chrome JS only — no XUL relink. No full mach package/DMG.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0036-darkstr-fonts-coherence.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

if grep -Fq 'Soft residual (0036)' "${COMP}/DarkstrDepthHooksChild.sys.mjs" 2>/dev/null \
  && grep -Fq 'fontSeed' "${COMP}/DarkstrDepthHooks.sys.mjs" 2>/dev/null \
  && grep -Fq 'installFontsInPage' "${COMP}/DarkstrDepthHooksChild.sys.mjs" 2>/dev/null; then
  echo "0036 markers already present — skip patch apply"
else
  # --forward: skips landed hunks if partially present
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
fi
grep -Fq 'Soft residual (0036)' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'fontSeed' "${COMP}/DarkstrDepthHooks.sys.mjs"
grep -Fq 'installFontsInPage' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'FIREFOX_BASELINE' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'measureText' "${COMP}/DarkstrDepthHooksChild.sys.mjs"

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
echo "0036 installed. Proof gates: hooks-off/Homogeneous → idle host fonts;"
echo "  Pollution+hooks: same seed → stable measureText/fonts.check digests (double-read);"
echo "  rotatePerSite eTLD diverge; same eTLD two tabs → same; seed-42 golden lock;"
echo "  no Chrome-only font names in surfaced lists. lastSeeds includes fontSeed."
