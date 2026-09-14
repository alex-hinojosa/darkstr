#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Verifies train-pinned M2 XOR observer patch presence + optional incremental rebuild.
set -euo pipefail
ENV_FILE="${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
STATUS_OUT="${HOME}/src/darkstr-gecko/M2-STATUS.local.md"
REPO_HINT="${DARKSTR_REPO:-${HOME}/src/darkstr}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi
: "${DARKSTR_GECKO_ROOT:?Set DARKSTR_GECKO_ROOT or source ${ENV_FILE}}"

PATCH_SRC=""
for cand in \
  "${REPO_HINT}/patches/0002-darkstr-mode-xor-rfp.patch" \
  "$(pwd)/patches/0002-darkstr-mode-xor-rfp.patch"; do
  if [[ -f "${cand}" ]]; then PATCH_SRC="${cand}"; break; fi
done

{
  echo "# M2 local STATUS $(date -u +%Y-%m-%dT%H:%MZ)"
  echo
  echo "## Tree"
  echo "- DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
  for need in client.mk browser browser/components/BrowserGlue.sys.mjs browser/components/moz.build lw/librewolf.cfg; do
    if [[ -e "${DARKSTR_GECKO_ROOT}/${need}" ]]; then echo "- OK ${need}"; else echo "- MISSING ${need}"; fi
  done
  echo
  echo "## Patch file"
  if [[ -n "${PATCH_SRC}" ]]; then
    echo "- patch: ${PATCH_SRC}"
    echo "- sha256: $(shasum -a 256 "${PATCH_SRC}" | awk '{print $1}')"
  else
    echo "- patch: NOT FOUND (clone/pull alex-hinojosa/darkstr)"
  fi
  echo
  echo "## Observer module (after apply)"
  if [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrModeXor.sys.mjs" ]]; then
    echo "- DarkstrModeXor.sys.mjs present"
    grep -n 'DarkstrModeXor\|privacy.resistFingerprinting\|darkstr.mode' \
      "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrModeXor.sys.mjs" | head -20 || true
    grep -n 'DarkstrModeXor' \
      "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs" \
      "${DARKSTR_GECKO_ROOT}/browser/components/moz.build" | head -20 || true
  else
    echo "- DarkstrModeXor.sys.mjs NOT YET — run apply-darkstr-patches.sh --require-root"
  fi
  echo
  echo "## Disk"
  df -h "${DARKSTR_GECKO_ROOT}" 2>/dev/null | head -5 || true
  echo
  echo "## Rebuild (optional, incremental)"
  echo "If objdir exists:"
  echo "  cd \"\$DARKSTR_GECKO_ROOT\" && ./mach build browser/components"
  echo "Full incremental:"
  echo "  cd \"\$DARKSTR_GECKO_ROOT\" && ./mach build"
  echo "Runtime XOR skim after rebuild: set darkstr.mode=pollution in about:config;"
  echo "  expect privacy.resistFingerprinting=false and fingerprintingProtection=false."
  echo "  Homogeneous restores RFP true. Do not customize RFP metrics."
} | tee "${STATUS_OUT}"

echo "Wrote ${STATUS_OUT}"
