#!/usr/bin/env bash
# Post-apply/build markers for M3-CPP-DOCSHELL (0007).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
ROOT="$DARKSTR_GECKO_ROOT"
fail=0
need() {
  if [[ ! -e "$1" ]]; then echo "MISSING $1"; fail=1; else echo "OK $1"; fi
}
grep_need() {
  if ! grep -Fq "$2" "$1"; then echo "MISSING marker '$2' in $1"; fail=1; else echo "OK marker in $1"; fi
}
need "$ROOT/docshell/base/DarkstrDocShellHooks.cpp"
need "$ROOT/docshell/base/DarkstrDocShellHooks.h"
grep_need "$ROOT/docshell/base/DarkstrDocShellHooks.h" "ShouldApplyPersona"
grep_need "$ROOT/docshell/base/DarkstrDocShellHooks.h" "CurrentPhase"
grep_need "$ROOT/docshell/base/nsDocShell.cpp" "M3-CPP-DOCSHELL"
grep_need "$ROOT/docshell/base/nsDocShell.cpp" "mBrowsingContext->Id()"
grep_need "$ROOT/browser/components/DarkstrNativePersona.sys.mjs" "Prefer C++ SoT mirror"
# Ensure prior surfaces not regresssed
grep_need "$ROOT/dom/base/Navigator.cpp" "DarkstrNavigatorHooks"
grep_need "$ROOT/netwerk/protocol/http/nsHttpHandler.cpp" "DarkstrNsHttpHooks"
echo "M3-CPP-DOCSHELL-MINI-VERIFY fail=$fail"
exit "$fail"
