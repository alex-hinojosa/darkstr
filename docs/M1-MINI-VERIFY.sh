#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD paths). Atlas: no mv under /Volumes/Mesh.
set -euo pipefail
ENV_FILE="${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
RSYNC_LOG="${HOME}/src/darkstr-gecko/rsync-out.log"
STATUS_OUT="${HOME}/src/darkstr-gecko/M1-STATUS.local.md"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi
: "${DARKSTR_GECKO_ROOT:?Set DARKSTR_GECKO_ROOT or source ${ENV_FILE}}"

{
  echo "# M1 local STATUS $(date -u +%Y-%m-%dT%H:%MZ)"
  echo
  echo "## Tree"
  echo "- DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
  for need in client.mk browser lw lw/librewolf.cfg; do
    if [[ -e "${DARKSTR_GECKO_ROOT}/${need}" ]]; then echo "- OK ${need}"; else echo "- MISSING ${need}"; fi
  done
  du -sh "${DARKSTR_GECKO_ROOT}" 2>/dev/null || true
  echo
  echo "## rsync-out.log (tail)"
  if [[ -f "${RSYNC_LOG}" ]]; then
    if pgrep -f 'rsync.*librewolf-155.0.1-1' >/dev/null 2>&1; then
      echo "- rsync: STILL RUNNING (left alone)"
    else
      echo "- rsync: no matching process (check log for finished/error)"
    fi
    tail -n 20 "${RSYNC_LOG}" || true
  else
    echo "- no ${RSYNC_LOG}"
  fi
  echo
  echo "## darkstr.cfg apply proof (fill after apply script)"
  if [[ -f "${DARKSTR_GECKO_ROOT}/lw/darkstr.cfg" ]]; then
    echo "- lw/darkstr.cfg present"
  else
    echo "- lw/darkstr.cfg NOT YET"
  fi
  grep -n 'darkstr.mode\|BEGIN darkstr-m1-prefs' "${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg" 2>/dev/null || echo "- librewolf.cfg: darkstr prefs not appended yet"
} | tee "${STATUS_OUT}"

echo "Wrote ${STATUS_OUT}"
