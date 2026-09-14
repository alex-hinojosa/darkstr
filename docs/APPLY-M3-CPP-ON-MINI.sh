#!/usr/bin/env bash
# Run on Alexander's Mac mini. Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr}"
PATCH="${REPO}/patches/0005-darkstr-cpp-native-hooks.patch"
if [[ ! -f "${PATCH}" ]]; then
  echo "Missing ${PATCH} — checkout builder/m3-cpp-native-hooks or pass repo path" >&2
  exit 1
fi
echo "Disk before apply:"
df -h "${DARKSTR_GECKO_ROOT}" | head -5
echo "Applying ${PATCH} to ${DARKSTR_GECKO_ROOT}"
patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
cd "${DARKSTR_GECKO_ROOT}"
echo "Starting ./mach build netwerk/protocol/http ..."
set +e
./mach build netwerk/protocol/http
MACH_EXIT=$?
set -e
echo "mach EXIT=${MACH_EXIT}"
bash "${REPO}/docs/M3-CPP-MINI-VERIFY.sh"
exit "${MACH_EXIT}"
