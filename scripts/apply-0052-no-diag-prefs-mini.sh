#!/usr/bin/env bash
# darkstr 0052 apply: no debug state in prefs.js (Fable QA B1 / O7 / O13).
#   Every darkstr diagnostic / mirror pref (*.last*, *armed, effectiveSeed,
#   persona.ua/platform/hardwareConcurrency/docShellPhase, lastDecision, …)
#   is kept in memory (module getDiagnostics()) and reaches prefs.js only
#   while darkstr.debug.diagPrefs is true (default false). DarkstrModeXor
#   clears stale values at startup and when diagPrefs is switched off
#   (DARKSTR_DIAG_PREFS / sweepDiagPrefs). DarkstrDepthHooks no longer falls
#   back to the last visited site's seed / eTLD+1 / global phase mirror.
#   Functional prefs (darkstr.pollutionActive, darkstr.persona.saved*,
#   darkstr.cookieFirewall.contentGate, config) are unchanged.
# Stacked on main @ 5faad83 (0048 + 0049r2 + 0050 + 0051r2 applied).
# Touches chrome JS only (browser/components) → no C++ recompile.
# usage: scripts/apply-0052-no-diag-prefs-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0052-files"
PATCH="$HERE/patches/0052-darkstr-no-diag-prefs.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
# file in patches/0052-files → path in the tree
MAP=(
  "DarkstrChaffScheduler.sys.mjs:browser/components/DarkstrChaffScheduler.sys.mjs"
  "DarkstrCookieFirewall.sys.mjs:browser/components/DarkstrCookieFirewall.sys.mjs"
  "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
  "DarkstrFfi.sys.mjs:browser/components/DarkstrFfi.sys.mjs"
  "DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs"
  "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
  "DarkstrWorkerHooks.sys.mjs:browser/components/DarkstrWorkerHooks.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# main @ 5faad83 tree baseline the patch was cut against.
BASE_SUMS="03f55beabb48b123b7f6e22540ff6e9029613d886263592bfb0321a04f069079  browser/components/DarkstrChaffScheduler.sys.mjs
ef058ac3be8e2c349facc04f11007ab24378319bf4e786fff609e489fbc79698  browser/components/DarkstrCookieFirewall.sys.mjs
b49887d8707f6b52823ec02e5bb7e675cff8bac72e26fead030f0a7c198df6eb  browser/components/DarkstrDepthHooks.sys.mjs
977bf00940a3c6a46f2d38e3f3404d2f8b65cefc04f9c13db60bdb705b15c020  browser/components/DarkstrFfi.sys.mjs
e2981ee3b7e28904478d69775a780ad2d2fd6acffaebd7e1bbb6a66a0b97858e  browser/components/DarkstrModeXor.sys.mjs
f8685514104cf49320afc4463b1cda43d826b15ab4b779c979ef756c0dcfce6b  browser/components/DarkstrNativePersona.sys.mjs
112d80f7feb51130f2c761b532a80a9c87ab5207a66bf052253836f70b933114  browser/components/DarkstrWorkerHooks.sys.mjs"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0052 already applied — tree matches patches/0052-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the main@5faad83 baseline 0052 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0052-files after apply" >&2; exit 1; }
done
C="$R/browser/components"
for e in "${MAP[@]}"; do
  m="$C/${e%%:*}"
  grep -Fq 'const DIAG_PREFS_PREF = "darkstr.debug.diagPrefs";' "$m"
  grep -Fq 'getDiagnostics() {' "$m"
done
grep -Fq 'export function sweepDiagPrefs()' "$C/DarkstrModeXor.sys.mjs"
grep -Fq 'this._lastSweep = sweepDiagPrefs();' "$C/DarkstrModeXor.sys.mjs"
# No direct prefs write of a diagnostic constant may remain.
if grep -En 'Services\.prefs\.set(Bool|Int|String)Pref\(\s*(ARMED_PREF|LAST_[A-Z_]+_PREF|EFFECTIVE_SEED_PREF|UA_MIRROR_PREF|PLATFORM_MIRROR_PREF|HW_MIRROR_PREF|DOCSHELL_PHASE_MIRROR_PREF|STRICT_NEXT_NAV_ARMED_PREF|PERSONA_LAST_ERROR_PREF|WEBGL_ENSURE_APPLIED_PREF|WEBGL_LAST_STATUS_PREF|LOAD_SOURCE_PREF)\b' \
    "$C"/Darkstr{ChaffScheduler,CookieFirewall,DepthHooks,Ffi,ModeXor,NativePersona,WorkerHooks}.sys.mjs; then
  echo "error: diagnostic pref still written straight to prefs" >&2; exit 1
fi
if grep -Eq '"darkstr\.persona\.(lastEtld|effectiveSeed|docShellPhase)"' "$C/DarkstrDepthHooks.sys.mjs"; then
  echo "error: DepthHooks still falls back to the last site's global mirrors" >&2; exit 1
fi
echo "0052 applied. Build (objdir pinned; never a bare mach build; chrome JS only):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
