#!/usr/bin/env bash
# darkstr 0049 apply: worker coherence (Rowan B3/B4/B5 + no-seed arming,
# blob: location, relative importScripts, wrapped-constructor shape). Run on
# the Mini.
#   Native: WorkerPrivate::Constructor resolves one persona per top-level
#   worker (dedicated: creating document's 0051 decision; shared/service: the
#   owning site's decision) via a JSProcessActor observer; WorkerNavigator
#   serves UA / platform / hardwareConcurrency / languages from it and the
#   stock loadInfo carries languages + timezone. The Phase 3 blob
#   importScripts Worker/SharedWorker wrapper, its Firefox 135 UA list and the
#   worker deviceMemory spoof are gone; the 0043 depth prelude is evaluated
#   natively before the main script. Windowless worker requests get the owning
#   site's persona headers.
# Stacked on 0051 (persona surface): needs 0051 applied.
# Touches chrome JS + dom/base/DarkstrNavigatorHooks + dom/workers
# (WorkerPrivate, WorkerNavigator) → libxul relink.
# usage: scripts/apply-0049-worker-coherence-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0049-files"
PATCH="$HERE/patches/0049-darkstr-worker-coherence.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
# file in patches/0049-files → path in the tree
MAP=(
  "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
  "DarkstrWorkerHooks.sys.mjs:browser/components/DarkstrWorkerHooks.sys.mjs"
  "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
  "DarkstrWorkerHooksParent.sys.mjs:browser/components/DarkstrWorkerHooksParent.sys.mjs"
  "DarkstrNavigatorHooks.cpp:dom/base/DarkstrNavigatorHooks.cpp"
  "DarkstrNavigatorHooks.h:dom/base/DarkstrNavigatorHooks.h"
  "WorkerNavigator.cpp:dom/workers/WorkerNavigator.cpp"
  "WorkerPrivate.cpp:dom/workers/WorkerPrivate.cpp"
  "ScriptLoader.cpp:dom/workers/ScriptLoader.cpp"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# 0051-applied baseline the patch was cut against.
BASE_SUMS="65caff30ad138bd6ed63be3dc9c43e7504afa37fb2fdee3a0a9dcb9e6f2b8dcb  browser/components/DarkstrNativePersona.sys.mjs
6e773cdba9b5e78be6ed3c050bd5705ac5c937dc4024d07ed4808ff53f4d670f  browser/components/DarkstrWorkerHooks.sys.mjs
42b1f83a30a82cd97e95b1a2b589be037755a66a7d038cda0d06fe8e9c0fc304  browser/components/DarkstrWorkerHooksChild.sys.mjs
28e2f31288feef0e7843a659ae88bc933721f4db3d456602f1b0c8b6683e171f  browser/components/DarkstrWorkerHooksParent.sys.mjs
77bcbfa03a6e6a1237c1228e52b9935ceede0417e578ffc31e3509ff540ce48e  dom/base/DarkstrNavigatorHooks.cpp
d75b5535baf5cc3108a2bd90e5fea4ca97723992aa5d608f13ce7747904aa6bd  dom/base/DarkstrNavigatorHooks.h
3fac7c4a6dfbf71f869c93b79ec9467e3273fda8a4fe214ce08d5885a210102b  dom/workers/WorkerNavigator.cpp
9645a1ee3e54a0f5df54437dc9cae6a0161f110acc9ad8c81f398f1c296fb32f  dom/workers/WorkerPrivate.cpp
ddfea257402574d3430a7c6bf281c2a8bf8e9da613d0fec6c66c15449bfa8cb1  dom/workers/ScriptLoader.cpp"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0049 already applied — tree matches patches/0049-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the 0051-applied baseline 0049 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0049-files after apply" >&2; exit 1; }
done
C="$R/browser/components"
grep -Fq 'workerSiteDecision' "$C/DarkstrNativePersona.sys.mjs"
grep -Fq '_workerOwnerDecisionForChannel' "$C/DarkstrNativePersona.sys.mjs"  # 0049r2
grep -Fq 'registerProcessActor' "$C/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'DarkstrWorkerPersonaChild' "$C/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'ResolveWorkerPersona' "$R/dom/workers/WorkerPrivate.cpp"
grep -Fq 'RunWorkerPrelude' "$R/dom/workers/WorkerPrivate.cpp"
grep -Fq 'PersonaForWorker' "$R/dom/workers/WorkerNavigator.cpp"
grep -Fq 'darkstr 0049r2' "$R/dom/workers/ScriptLoader.cpp"  # 0049r2: nested worker main script labelled
if grep -Eq 'rv:135|Mac OS X 14\.0|UA_GROUPS' "$C/DarkstrWorkerHooks.sys.mjs"; then
  echo "error: separate worker UA list still present" >&2; exit 1
fi
if grep -Eq 'createObjectURL|replaceConstructor|spoof\("deviceMemory"' "$C/DarkstrWorkerHooksChild.sys.mjs"; then
  echo "error: blob Worker wrapper / deviceMemory spoof still present" >&2; exit 1
fi
if grep -Fq 'TryGetHardwareConcurrency' "$R/dom/workers/WorkerNavigator.cpp"; then
  echo "error: global-pref worker hardwareConcurrency still compiled in" >&2; exit 1
fi
echo "0049 applied. Build (objdir pinned; never a bare mach build; C++ changed → libxul relink):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
