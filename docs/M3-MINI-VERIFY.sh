#!/usr/bin/env bash
# Optional Mini path-check for M3 hook sites. Run on Alexander's Mac mini (SSD).
# Atlas: never mv under /Volumes/Mesh. Do not bootstrap/build. Do not hang waiting on Mesh.
set -euo pipefail
ENV_FILE="${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
STATUS_OUT="${HOME}/src/darkstr-gecko/M3-PATHCHECK.local.md"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi
: "${DARKSTR_GECKO_ROOT:?Set DARKSTR_GECKO_ROOT or source ${ENV_FILE}}"

# Paths hinted by duppel_bridge::HookSite::gecko_path_hints (155.x train — verify locally).
PATHS=(
  "netwerk/protocol/http/nsHttpHandler.cpp"
  "netwerk/protocol/http/nsHttpChannel.cpp"
  "dom/base/Navigator.cpp"
  "dom/webidl/Navigator.webidl"
  "docshell/base/nsDocShell.cpp"
  "lw/librewolf.cfg"
  "lw/darkstr.cfg"
)

{
  echo "# M3 path check $(date -u +%Y-%m-%dT%H:%MZ)"
  echo
  echo "## Tree"
  echo "- DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
  echo "- Honesty: existence checks only — does NOT claim C++ hooks applied"
  echo
  echo "## Hook-site path hints"
  for rel in "${PATHS[@]}"; do
    if [[ -e "${DARKSTR_GECKO_ROOT}/${rel}" ]]; then
      echo "- OK ${rel}"
    else
      echo "- MISSING ${rel}"
    fi
  done
  echo
  echo "## Mesh"
  if [[ -d /Volumes/Mesh ]]; then
    echo "- /Volumes/Mesh present — leave alone (no mv; no wait loop)"
  else
    echo "- /Volumes/Mesh not mounted"
  fi
} | tee "${STATUS_OUT}"

echo "Wrote ${STATUS_OUT}"
