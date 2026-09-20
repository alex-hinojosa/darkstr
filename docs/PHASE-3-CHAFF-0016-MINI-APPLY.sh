#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 pin 1 — apply 0016 chaff native scheduler + incremental browser/components build.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0016-darkstr-chaff-native-scheduler.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq 'DarkstrChaffScheduler' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs"
cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"
echo "Markers: DarkstrChaffScheduler present. Hooks remain default-off."
