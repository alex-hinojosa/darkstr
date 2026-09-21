#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 optional pin — apply/refresh 0024 richer chrome chaff beacon bodies
# on top of 0016 DarkstrChaffScheduler.
# Quiet/Balanced/Loud + pollution+hooks gates unchanged. Ordinary HTTP only.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0024-darkstr-chaff-richer-beacon-bodies.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"

# Prefer unified apply when markers absent; else patch --forward.
# Full apply may fail on already-evolved DocShell (0007 vs 0020–0022). Tolerate that;
# always force 0024 onto DarkstrChaffScheduler.
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root || true
fi
patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
rm -f "${DARKSTR_GECKO_ROOT}/browser/components/"*.rej
grep -Fq 'INTEREST_CLUSTERS' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'buildBeaconConfig' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'buildGA4Payload' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'buildMetaPayload' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'LAST_BEACON_PREF' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq '0024 honest subset' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'duppel_chaff::ChaffSchedulerPlan' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"

cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

# Subdirectory build may skip MOZ_SRC install — force dist_bin + app mirror.
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
SRC="${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
BIN="${OBJ}/dist/bin/moz-src/browser/components/DarkstrChaffScheduler.sys.mjs"
APP="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components/DarkstrChaffScheduler.sys.mjs"
test -e "${BIN}"
if [[ ! -e "${APP}" ]]; then
  ln -sf "${SRC}" "${APP}"
fi
test -e "${APP}"
echo "Markers: INTEREST_CLUSTERS + buildBeaconConfig (GA/GA4/Meta) in ChaffScheduler + dist/bin + LibreWolf.app. Check about:config darkstr.chaff.lastFireAt / lastBeaconKind / schedulerArmed. Hooks remain default-off. No CF/TLS/JA3; WebExt may remain richer for ISOLATED sendBeacon + DOM chaff."
