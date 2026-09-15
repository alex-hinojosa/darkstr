#!/usr/bin/env bash
# Pref/doc presence checks for Native-Compatible banking smoke — not headed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check() {
  local desc="$1"; shift
  if "$@"; then
    echo "OK  $desc"
  else
    echo "FAIL $desc"
    fail=$((fail + 1))
  fi
}
check "NC smoke doc" test -f "$ROOT/docs/NC-BANKING-SMOKE.md"
check "PREF-BRIDGE mentions nativeCompat" grep -Fq 'nativeCompat' "$ROOT/docs/PREF-BRIDGE.md"
check "settings panel NC copy" grep -Fq 'Native-Compatible' "$ROOT/extension/settings/settings.html"
check "sites helper exists" test -f "$ROOT/extension/lib/sites.js"
check "seed goldens fixture" test -f "$ROOT/fixtures/seed-goldens.json"
if grep -E 'defaultPref\(\s*"privacy\.fingerprintingProtection"\s*,\s*false' "$ROOT/patches/stubs/darkstr.cfg" >/dev/null 2>&1; then
  echo "FAIL no static FPP=false in darkstr.cfg stub"
  fail=$((fail + 1))
else
  echo "OK  no static FPP=false in darkstr.cfg stub"
fi
echo "NC-BANKING-MINI-VERIFY fail=$fail"
exit "$fail"
