#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 soft residuals (0019) — lastInstall + OfflineAudio + HW best-effort.
# Carries pin lessons: waiveXrays / pageshow / getPrefType / safeForUntrusted / install-dist_bin.
# Prefer this after pins 1–3 are on the Mini tree. Also safe if 0017/0018 patches were
# refreshed (their new-file bodies now embed the same soft-residual fixes).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0019-darkstr-phase3-soft-residuals.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

# Incremental patch against live Depth/Worker modules. If markers already present
# (e.g. refreshed from updated 0017/0018), skip cleanly.
if grep -Fq 'channelContentKey' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs" \
  && grep -Fq 'runtimeOnly' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs" \
  && grep -Fq '_reportRuntime' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"; then
  echo "0019 soft-residual markers already present — skip patch apply"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
rm -f "${DARKSTR_GECKO_ROOT}/browser/components/"*.rej

grep -Fq 'channelContentKey' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'runtimeOnly' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq '_reportRuntime' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'spoof("hardwareConcurrency"' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'Cu.waiveXrays' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'safeForUntrustedWebProcess' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"

if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
fi

cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
for mod in \
  DarkstrDepthHooks.sys.mjs DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooksParent.sys.mjs \
  DarkstrWorkerHooks.sys.mjs DarkstrWorkerHooksChild.sys.mjs DarkstrWorkerHooksParent.sys.mjs; do
  test -e "${BIN_DIR}/${mod}"
  if [[ ! -e "${APP_DIR}/${mod}" ]]; then
    ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
  fi
  test -e "${APP_DIR}/${mod}"
done
echo "Markers: soft residuals in Depth+Worker modules (source + dist/bin + LibreWolf.app)."
echo "Check about:config darkstr.worker.lastInstall (ok/installed after wrap) / lastError (runtime-only)."
echo "OfflineAudio getChannelData fill should yield nonzero deltaSum under Pollution+hooks."
echo "hardwareConcurrency: best-effort instance/proto spoof; host value may remain if non-configurable."
echo "Hooks remain default-off. Mini apply from this helper; Proof XOR = parent/operator."
