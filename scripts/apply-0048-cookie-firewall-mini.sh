#!/usr/bin/env bash
# darkstr 0048 apply: cookie firewall correctness (chrome JS only). Run on the Mini.
# Fixes Rowan QA B1 (cross-site iframe read), B2 (HttpOnly/attributes),
# credentials 'omit', third-party partitioning by top site, N1 (re-hook every
# document) and mirror staleness. Gecko CookieService is NOT touched.
# usage: scripts/apply-0048-cookie-firewall-mini.sh   (needs DARKSTR_GECKO_ROOT; 0035 + 0042 applied)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0048-files"
PATCH="$HERE/patches/0048-darkstr-cookie-firewall-correctness.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
C="$DARKSTR_GECKO_ROOT/browser/components"
MODS=(DarkstrCookieFirewall.sys.mjs DarkstrCookieFirewallChild.sys.mjs DarkstrCookieFirewallParent.sys.mjs)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# Pre-0048 (0035 + 0042) baseline the patch was cut against.
BASE_SUMS="ba078a2a40b0f3b06a1ae588de54b8985117453be02e4e21349df0597874c829  DarkstrCookieFirewall.sys.mjs
0e624bfe231551557233c8b6356f0d3ec89c447fceef1883de86a3ec2ef0edba  DarkstrCookieFirewallChild.sys.mjs
494844319b8979aaf690d321dd548c5a3f55c76f5110fe87c8ddef32b142a1be  DarkstrCookieFirewallParent.sys.mjs"
already=1
for m in "${MODS[@]}"; do cmp -s "$F/$m" "$C/$m" || already=0; done
if [[ $already == 1 ]]; then
  echo "0048 already applied — tree matches patches/0048-files"
else
  (cd "$C" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $C is not the 0035+0042 baseline 0048 was cut against" >&2; exit 1; }
  (cd "$DARKSTR_GECKO_ROOT" && patch -p1 --forward --batch < "$PATCH")
fi
for m in "${MODS[@]}"; do
  cmp "$F/$m" "$C/$m" || { echo "error: $m differs from patches/0048-files after apply" >&2; exit 1; }
done
grep -Fq 'DarkstrCookieCore' "$C/DarkstrCookieFirewall.sys.mjs"
grep -Fq 'installedByDocument' "$C/DarkstrCookieFirewallChild.sys.mjs"
if grep -Fq 'matches: ["*://*/*"]' "$C/DarkstrCookieFirewall.sys.mjs"; then
  echo "error: actor still restricted to *://*/*" >&2; exit 1
fi
echo "0048 applied. Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
