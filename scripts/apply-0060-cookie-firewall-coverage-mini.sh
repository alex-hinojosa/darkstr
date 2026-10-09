#!/usr/bin/env bash
# darkstr 0060 apply (Fable B8: cookie firewall coverage). Opt-in feature: defaults unchanged
# (darkstr.cookieFirewall.enabled stays false; disarmed = stock Gecko everywhere).
#  - Extension browsers / frames: the firewall JSWindowActor is registered for every
#    message-manager group, so web frames in extension popups / sidebars / background pages get a
#    gate answer (CookieCommons "darkstr-cookie-gate") instead of the C++ fail-closed default. A
#    frame tree under a non-web top (extension page) is owned by its outermost http(s) document.
#  - Worker CookieStore (ServiceWorkerGlobalScope): CookieCommons no longer fails every worker
#    closed; CookieStoreParent asks the firewall ("darkstr-cookie-store") for the same allowlist /
#    sandbox decision and jar the partition's documents get; no answer while armed = fail closed.
#  - ClearDataService: DarkstrCookieFirewallCleaner under CLEAR_COOKIES purges the sandbox jar
#    (Forget About This Site, Clear Recent History, Clear-Site-Data, clear-on-quit, containers);
#    a partitioned clear only clears that partition.
#  - One pipeline (_admit / _purge / _seedFor) with a documented 0061 hook (setPipelineHook).
#  - No plaintext: site / cookie-value diagnostics reach prefs.js only as keyed digests.
# Applies on main (789f66c: ... 0056 / 0057c / 0058b). C++ + chrome JS.
# usage: scripts/apply-0060-cookie-firewall-coverage-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0060-files"
PATCH="$HERE/patches/0060-darkstr-cookie-firewall-coverage.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
 "DarkstrCookieFirewall.sys.mjs:browser/components/DarkstrCookieFirewall.sys.mjs"
 "ClearDataService.sys.mjs:toolkit/components/cleardata/ClearDataService.sys.mjs"
 "CookieCommons.cpp:netwerk/cookie/CookieCommons.cpp"
 "CookieStoreParent.cpp:dom/cookiestore/CookieStoreParent.cpp"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0060 already applied — tree matches patches/0060-files"
else
  (cd "$R" && shasum -a 256 -c "$F/BASE_SHA256SUMS") \
    || { echo "error: tree is not the main (789f66c) baseline 0060 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0060-files after apply" >&2; exit 1; }
done
C="$R/browser/components/DarkstrCookieFirewall.sys.mjs"
grep -Fq 'export const DarkstrCookieFirewallCleaner' "$C"
grep -Fq 'const COOKIE_STORE_TOPIC = "darkstr-cookie-store";' "$C"
grep -Fq 'setPipelineHook(hook)' "$C"
if grep -Fq 'messageManagerGroups: ["browsers"]' "$C"; then echo "error: actor still limited to browsers" >&2; exit 1; fi
grep -Fq 'cleaners: [CookieCleaner, DarkstrCookieFirewallCleaner]' "$R/toolkit/components/cleardata/ClearDataService.sys.mjs"
grep -Fq '"darkstr-cookie-store"' "$R/dom/cookiestore/CookieStoreParent.cpp"
grep -Fq 'darkstr 0060 (was 0048r2 F3' "$R/netwerk/cookie/CookieCommons.cpp"
echo "0060 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
