#!/usr/bin/env bash
# Mini verify for M3 live native persona hooks. Run on Alexander's Mac mini (SSD).
# Atlas: never mv under /Volumes/Mesh. Do not hang waiting on Mesh.
set -euo pipefail
ENV_FILE="${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
STATUS_OUT="${HOME}/src/darkstr-gecko/M3-VERIFY.local.md"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi
: "${DARKSTR_GECKO_ROOT:?Set DARKSTR_GECKO_ROOT or source ${ENV_FILE}}"

PATHS=(
  "browser/components/DarkstrModeXor.sys.mjs"
  "browser/components/DarkstrNativePersona.sys.mjs"
  "browser/components/DarkstrNativePersonaParent.sys.mjs"
  "browser/components/DarkstrNativePersonaChild.sys.mjs"
  "browser/components/BrowserGlue.sys.mjs"
  "browser/components/moz.build"
  "lw/librewolf.cfg"
  "lw/darkstr.cfg"
)

{
  echo "# M3 verify $(date -u +%Y-%m-%dT%H:%MZ)"
  echo
  echo "## Tree"
  echo "- DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
  echo
  echo "## Live hook files"
  for rel in "${PATHS[@]}"; do
    if [[ -e "${DARKSTR_GECKO_ROOT}/${rel}" ]]; then
      echo "- OK ${rel}"
    else
      echo "- MISSING ${rel}"
    fi
  done
  echo
  echo "## Markers"
  if grep -q 'DarkstrNativePersona.init' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs" 2>/dev/null; then
    echo "- OK BrowserGlue wires DarkstrNativePersona.init"
  else
    echo "- MISSING BrowserGlue DarkstrNativePersona.init"
  fi
  if grep -q 'DarkstrNativePersona.sys.mjs' "${DARKSTR_GECKO_ROOT}/browser/components/moz.build" 2>/dev/null; then
    echo "- OK moz.build lists DarkstrNativePersona.sys.mjs"
  else
    echo "- MISSING moz.build DarkstrNativePersona entry"
  fi
  if grep -q 'darkstr.nativePersonaHooks' "${DARKSTR_GECKO_ROOT}/lw/darkstr.cfg" "${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg" 2>/dev/null; then
    echo "- OK nativePersonaHooks defaultPref present"
  else
    echo "- WARN nativePersonaHooks defaultPref not found in lw cfgs"
  fi
  echo
  echo "## Mesh"
  if [[ -d /Volumes/Mesh ]]; then
    echo "- /Volumes/Mesh present — leave alone (no mv; no wait loop)"
  else
    echo "- /Volumes/Mesh not mounted"
  fi
  echo
  echo "## Honesty"
  echo "- This script checks tree presence only; record mach build EXIT separately."
} | tee "${STATUS_OUT}"

echo "Wrote ${STATUS_OUT}"
