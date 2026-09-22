#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 soft P1 coherence (0028) — native Intl timezone + WebRTC pref kill.
# Chrome JS only — no XUL relink required.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0028-darkstr-fp-coherence-p1-tz-webrtc.patch"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"
if grep -Fq 'P1 coherence (0028)' "${COMP}/DarkstrNativePersonaParent.sys.mjs" \
  && grep -Fq '_applyWebRtcKillForPollution' "${COMP}/DarkstrNativePersona.sys.mjs" \
  && grep -Fq 'parsed.timezone' "${COMP}/DarkstrNativePersona.sys.mjs"; then
  echo "0028 markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
grep -Fq 'P1 coherence (0028)' "${COMP}/DarkstrNativePersonaParent.sys.mjs"
grep -Fq '_applyWebRtcKillForPollution' "${COMP}/DarkstrNativePersona.sys.mjs"
grep -Fq 'parsed.timezone' "${COMP}/DarkstrNativePersona.sys.mjs"
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
echo "0028 installed. Proof: first-doc host TZ; SubsequentNav persona TZ + WebRTC disabled; Homogeneous TZ clear + WebRTC exact restore."
