#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 4 soft residual (0031) — Brave-style silence-safe audio farbling
# (AnalyserNode + getChannelData / copyFromChannel). Chrome JS only — no XUL.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0031-darkstr-audio-silence-farbling.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
if grep -Fq 'Soft residual (0031)' "${COMP}/DarkstrDepthHooksChild.sys.mjs" \
  && grep -Fq 'farbleFloat' "${COMP}/DarkstrDepthHooksChild.sys.mjs" \
  && grep -Fq 'getByteTimeDomainData' "${COMP}/DarkstrDepthHooksChild.sys.mjs" \
  && grep -Fq 'copyFromChannel' "${COMP}/DarkstrDepthHooksChild.sys.mjs"; then
  echo "0031 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'Soft residual (0031)' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'farbleFloat' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'AnalyserNode' "${COMP}/DarkstrDepthHooksChild.sys.mjs"
grep -Fq '0.999 +' "${COMP}/DarkstrDepthHooksChild.sys.mjs"

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
echo "0031 installed. Proof gates: same seed → stable double-read audio;"
echo "  silence/zero → no additive tell (0*fudge==0); eTLD rotate → different digests;"
echo "  seed-42 lock → golden audio coherent; Homogeneous/hooks-off idle."
