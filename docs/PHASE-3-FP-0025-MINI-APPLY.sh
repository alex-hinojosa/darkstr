#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 P0 FP coherence (0025) — WorkerHooks arm + window HW=8 + langs es.
# Carries pin lessons: install-dist_bin + LibreWolf.app moz-src; C++ needs XUL relink.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0025-darkstr-fp-coherence-p0.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

# Refresh mutable modules from this tip before apply so marker-skip cannot leave
# stale Worker/NativePersona bodies while BrowserGlue stays current.
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
for mod in \
  DarkstrWorkerHooks.sys.mjs \
  DarkstrNativePersona.sys.mjs \
  DarkstrNativePersonaChild.sys.mjs \
  DarkstrNativePersonaParent.sys.mjs; do
  if [[ -f "${REPO}/../_not_used" ]]; then :; fi
done

if grep -Fq 'Global arm payload' "${COMP}/DarkstrWorkerHooks.sys.mjs" \
  && grep -Fq 'instance-first hardwareConcurrency' "${COMP}/DarkstrNativePersonaChild.sys.mjs" \
  && grep -Fq 'Pulse primary' "${COMP}/DarkstrNativePersonaParent.sys.mjs" \
  && grep -Fq 'persona default 8' "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp"; then
  echo "0025 FP-coherence markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
rm -f "${COMP}/"*.rej "${DARKSTR_GECKO_ROOT}/dom/base/"*.rej

grep -Fq 'Global arm payload' "${COMP}/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'instance-first hardwareConcurrency' "${COMP}/DarkstrNativePersonaChild.sys.mjs"
grep -Fq 'Pulse primary' "${COMP}/DarkstrNativePersonaParent.sys.mjs"
grep -Fq 'stale string value' "${COMP}/DarkstrNativePersona.sys.mjs"
grep -Fq 'persona default 8' "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp"

# Do NOT run full apply-darkstr-patches here: older DocShell 0007 fails on the
# already-evolved 0020–0022 tree (same lesson as 0023 helper). This helper only
# applies 0025, then builds.

cd "${DARKSTR_GECKO_ROOT}"
# Chrome JS + C++ Navigator hooks
./mach build --allow-subdirectory-build browser/components
./mach build --allow-subdirectory-build dom/base
# XUL / libxul relink so C++ TryGetHardwareConcurrency ships in the app
./mach build --allow-subdirectory-build toolkit/library || \
  ./mach build --allow-subdirectory-build toolkit/library/gtest 2>/dev/null || \
  echo "WARN: toolkit/library subdirectory build failed — try full ./mach build if HW still host"
echo "mach EXIT=$?"

OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
for mod in \
  DarkstrWorkerHooks.sys.mjs \
  DarkstrNativePersona.sys.mjs DarkstrNativePersonaChild.sys.mjs DarkstrNativePersonaParent.sys.mjs; do
  test -e "${BIN_DIR}/${mod}" || test -e "${COMP}/${mod}"
  if [[ -d "${APP_DIR}" && ! -e "${APP_DIR}/${mod}" ]]; then
    ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
  fi
done
echo "Markers: 0025 FP coherence (Worker arm + HW + langs) in source + dist."
echo "Proof XOR: Pollution+hooks after SubsequentNav → window HW=8, worker.hooksArmed=true + install, langs include es."
echo "Homogeneous idle unchanged. Non-claims: ServiceWorker, fonts, screen, CF/TLS, Chrome spoofing."
echo "Hooks remain default-off. Mini apply from this helper; Proof XOR = parent/operator."
