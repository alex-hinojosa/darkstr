#!/usr/bin/env bash
# Mini verify for M3-CPP nsHttp hooks. Run on Alexander's Mac mini (SSD).
set -euo pipefail
ENV_FILE="${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  root_line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?DARKSTR_GECKO_ROOT=' "${ENV_FILE}" | tail -n1 || true)"
  if [[ -n "${root_line}" ]]; then
    eval "${root_line}"
    export DARKSTR_GECKO_ROOT
  fi
fi
: "${DARKSTR_GECKO_ROOT:?Set DARKSTR_GECKO_ROOT or source ${ENV_FILE}}"

echo "## M3-CPP Mini verify"
echo "- DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
ok=1
need=(
  "netwerk/protocol/http/DarkstrNsHttpHooks.cpp"
  "netwerk/protocol/http/DarkstrNsHttpHooks.h"
  "netwerk/protocol/http/nsHttpHandler.cpp"
  "netwerk/protocol/http/moz.build"
  "browser/components/DarkstrNativePersona.sys.mjs"
)
for rel in "${need[@]}"; do
  if [[ -e "${DARKSTR_GECKO_ROOT}/${rel}" ]]; then
    echo "- OK ${rel}"
  else
    echo "- MISSING ${rel}"
    ok=0
  fi
done
if grep -q 'DarkstrNsHttpHooks' "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/nsHttpHandler.cpp" 2>/dev/null; then
  echo "- OK nsHttpHandler DarkstrNsHttpHooks call-in"
else
  echo "- FAIL nsHttpHandler missing DarkstrNsHttpHooks"; ok=0
fi
if grep -q 'DarkstrNsHttpHooks.cpp' "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/moz.build" 2>/dev/null; then
  echo "- OK moz.build DarkstrNsHttpHooks.cpp"
else
  echo "- FAIL moz.build missing DarkstrNsHttpHooks.cpp"; ok=0
fi
if grep -q 'darkstr.persona.ua' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" 2>/dev/null; then
  echo "- OK chrome UA mirror pref"
else
  echo "- FAIL chrome UA mirror missing"; ok=0
fi
df -h "${DARKSTR_GECKO_ROOT}" 2>/dev/null | head -5 || true
echo "- This script checks tree presence only; record mach build EXIT separately."
if [[ "${ok}" -eq 1 ]]; then
  echo "M3-CPP VERIFY: PASS (tree markers)"
  exit 0
fi
echo "M3-CPP VERIFY: FAIL"
exit 1
