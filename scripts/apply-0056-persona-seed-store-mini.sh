#!/usr/bin/env bash
# darkstr 0056 apply (Fable N6 follow-up): persisted per-site persona seeds.
#  - new browser/components/DarkstrPersonaSeedStore.sys.mjs (+ moz.build): <profile>/darkstr/persona-seeds.json,
#    parent-only, atomic, 0600; entries v2 {c,h,s}, c = HMAC(K,"ctx:"+ctx), h = HMAC(K, ctx|eTLD+1), K wrapped by OSKeyStore
#    (unavailable -> session-only); per container; private memory-only; darkstr.persona.seed bypasses it;
#    keep rule = persist-data-on-shutdown exceptions when cookies/site data are cleared on shutdown.
#  - ClearDataService: DarkstrPersonaSeedCleaner on CLEAR_FINGERPRINTING_PROTECTION_STATE (site incl. subdomains,
#    principal, all + key rotation, range by first-seen day, origin-attributes pattern / container deletion).
#  - NativePersona / CookieFirewall / DepthHooks / WorkerHooks: seeds per persona context (container / private);
#    DarkstrNavigatorHooks.cpp passes userContextId / privateBrowsingId for windowless workers.
# Needs 0052 + 0053 + 0053r2 + 0055 r2 applied. Touches C++ dom/base (libxul relink) + chrome JS + toolkit JS.
# usage: scripts/apply-0056-persona-seed-store-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0056-files"
PATCH="$HERE/patches/0056-darkstr-persona-seed-store.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
 "DarkstrCookieFirewall.sys.mjs:browser/components/DarkstrCookieFirewall.sys.mjs"
 "DarkstrDepthHooks.sys.mjs:browser/components/DarkstrDepthHooks.sys.mjs"
 "DarkstrWorkerHooks.sys.mjs:browser/components/DarkstrWorkerHooks.sys.mjs"
 "DarkstrWorkerHooksChild.sys.mjs:browser/components/DarkstrWorkerHooksChild.sys.mjs"
 "DarkstrNavigatorHooks.cpp:dom/base/DarkstrNavigatorHooks.cpp"
 "ClearDataService.sys.mjs:toolkit/components/cleardata/ClearDataService.sys.mjs"
 "browser-components-moz.build:browser/components/moz.build"
 "DarkstrPersonaSeedStore.sys.mjs:browser/components/DarkstrPersonaSeedStore.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0056 already applied — tree matches patches/0056-files"
else
  [[ -e "$R/browser/components/DarkstrPersonaSeedStore.sys.mjs" ]] \
    && { echo "error: DarkstrPersonaSeedStore.sys.mjs exists but the tree is not the 0056 state" >&2; exit 1; }
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the 0052+0053+0053r2+0055r2 baseline 0056 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0056-files after apply" >&2; exit 1; }
done
grep -Fq 'cleaners: [FingerprintingProtectionStateCleaner, DarkstrPersonaSeedCleaner],' "$R/toolkit/components/cleardata/ClearDataService.sys.mjs"
grep -Fq '"DarkstrPersonaSeedStore.sys.mjs",' "$R/browser/components/moz.build"
grep -Fq 'u"privateBrowsingId"_ns' "$R/dom/base/DarkstrNavigatorHooks.cpp"
echo "0056 applied. Build (objdir pinned; never a bare mach build; moz.build changed -> mach build re-runs configure-time backend):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
