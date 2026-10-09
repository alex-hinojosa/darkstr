#!/usr/bin/env bash
# darkstr 0058 apply: OS-derived navigator fields follow the persona's OS.
#  - NativePersona: platformFieldsFor(snapshot) → platform / appVersion / oscpu Gecko reports on the
#    snapshot's OS (UA OS token first, else platform). A pasted Win32 lock without appVersion used to
#    get the host's "5.0 (Macintosh)" (Proof 0055r2 note); seeded personas are host-OS (unchanged values).
#  - NativePersonaChild: appVersion + oscpu hooked like platform (prototype accessors, native fallback).
#  - Workers: WorkerHooksChild puts appVersion in the resolve bag; DarkstrNavigatorHooks reads it into
#    DarkstrWorkerPersona::mAppVersion; WorkerNavigator::GetAppVersion answers it (as GetPlatform does).
# Needs 0057 (r2) applied. C++ (dom/base, dom/workers) + chrome JS.
# usage: scripts/apply-0058-snapshot-platform-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0058-files"
PATCH="$HERE/patches/0058-darkstr-snapshot-platform.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
 "DarkstrNativePersonaChild.sys.mjs:browser/components/DarkstrNativePersonaChild.sys.mjs"
 "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
 "DarkstrNavigatorHooks.h:dom/base/DarkstrNavigatorHooks.h"
 "DarkstrNavigatorHooks.cpp:dom/base/DarkstrNavigatorHooks.cpp"
 "WorkerNavigator.cpp:dom/workers/WorkerNavigator.cpp"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
grep -Fq 'privacy.baselineFingerprintingProtection' "$R/browser/components/DarkstrModeXor.sys.mjs" \
  || { echo "error: 0057r2 is not applied" >&2; exit 1; }
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0058 already applied — tree matches patches/0058-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0057r2 baseline 0058 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0058-files after apply" >&2; exit 1; }
done
grep -Fq 'platformFieldsFor' "$R/browser/components/DarkstrNativePersona.sys.mjs"
grep -Fq 'get appVersion()' "$R/browser/components/DarkstrNativePersonaChild.sys.mjs"
grep -Fq 'persona->mAppVersion' "$R/dom/workers/WorkerNavigator.cpp"
echo "0058 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
