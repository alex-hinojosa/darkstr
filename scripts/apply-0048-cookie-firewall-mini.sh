#!/usr/bin/env bash
# darkstr 0048 apply: cookie firewall correctness. Run on the Mini.
# 0048: Rowan QA B1 (cross-site iframe read), B2 (HttpOnly/attributes),
#   credentials 'omit', third-party partitioning by top site, N1 (re-hook every
#   document) and mirror staleness — chrome JS.
# 0048r2 (Proof FAILED f3f1e748): F1 Set-Cookie ordered before the response
#   reaches the page, F2 Gecko TCP/CHIPS buckets incl. the foreign-ancestor bit
#   (A-B-A), check 4 (unpartitioned 3P cookies rejected like stock) — chrome JS;
#   F3 native cookie gate — C++ (netwerk/cookie/CookieCommons, CookieStoreNotifier)
#   + static pref darkstr.cookieFirewall.contentGate (new libpref group
#   "darkstr"; default false, flipped on the default branch while armed).
# Accepts a tree at the 0035+0042 baseline, or at 0048 (f3f1e748) → upgrades to r2.
# usage: scripts/apply-0048-cookie-firewall-mini.sh   (needs DARKSTR_GECKO_ROOT; 0035 + 0042 applied)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0048-files"
PATCH="$HERE/patches/0048-darkstr-cookie-firewall-correctness.patch"
RESPIN="$HERE/patches/0048r2-cookie-firewall-respin.patch"
GATE="$HERE/patches/0048r2-cookie-firewall-native-gate.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"; C="$R/browser/components"
MODS=(DarkstrCookieFirewall.sys.mjs DarkstrCookieFirewallChild.sys.mjs DarkstrCookieFirewallParent.sys.mjs)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# Pre-0048 (0035 + 0042) baseline the patch was cut against.
BASE_SUMS="ba078a2a40b0f3b06a1ae588de54b8985117453be02e4e21349df0597874c829  DarkstrCookieFirewall.sys.mjs
0e624bfe231551557233c8b6356f0d3ec89c447fceef1883de86a3ec2ef0edba  DarkstrCookieFirewallChild.sys.mjs
494844319b8979aaf690d321dd548c5a3f55c76f5110fe87c8ddef32b142a1be  DarkstrCookieFirewallParent.sys.mjs"
# 0048 as packaged in darkstr-0048-f3f1e748.dmg (Proof FAILED) — respin input.
V1_SUMS="87f71498c374f49642a42c012cf0fa9c96c52c22e4039bafbee46b0bb40e75ec  DarkstrCookieFirewall.sys.mjs
1a2e973fdb63c6aba2e1719158df3e33afc0fbdb25f2230cad71542110545338  DarkstrCookieFirewallChild.sys.mjs
8d28b9a2c7620a4035cc6fe91035aa3319d3cb714c884ed03df7f3dcf9b8992b  DarkstrCookieFirewallParent.sys.mjs"
# Native gate: stock FF156.0.1 files and the expected result.
GATE_BASE="a822bab12d78708e534e5740961ee855f5380ccb03b35683c89acef185b8bf68  netwerk/cookie/CookieCommons.cpp
0c519c8d230998ba798576a2fd213bf65156125d195141673bb545126fec1633  netwerk/cookie/CookieCommons.h
6b3a51bb78d704f64581e5dace4266ff867b8bfa59f19affef65d7b8b41088f3  dom/cookiestore/CookieStoreNotifier.cpp
0ed7ef4ac55bcc4c13dbf0594975dc4ea0e02a8e30025e9ca1234ecbae2a84e9  modules/libpref/init/StaticPrefList.yaml
ff4ef9388d04088c57a6e48815bcd86a70dbd2bbaf2ddc1cd9b9f04dc14e2da7  modules/libpref/moz.build"
GATE_POST="b78d93231ba6a0e222a0ee1a7c95dde88475211b789bddbd216858fedd494252  netwerk/cookie/CookieCommons.cpp
913f5caf16ee3e4fe7e6c60c0c7cef27e1fd97bf6e2dc345ce6a860e8b0ee758  netwerk/cookie/CookieCommons.h
fe6468139c646176c25cba02938e7ccba541927fc532f00f6a81437345997dea  dom/cookiestore/CookieStoreNotifier.cpp
01e38e3d20f8e9677e3c559ed47a2843cee11ae69a94a18cb2da58ef73ae47a6  modules/libpref/init/StaticPrefList.yaml
5d6e1a090fa6f31c281b09b5e319bfcc80df5039db11e458a29a91335dfcaa52  modules/libpref/moz.build"
sums_ok() { (cd "$1" && shasum -a 256 -c <(printf '%s\n' "$2") >/dev/null 2>&1); }

# ---- chrome JS
already=1
for m in "${MODS[@]}"; do cmp -s "$F/$m" "$C/$m" || already=0; done
if [[ $already == 1 ]]; then
  echo "0048 JS already applied — tree matches patches/0048-files"
elif sums_ok "$C" "$V1_SUMS"; then
  echo "tree at 0048 (f3f1e748) — applying 0048r2 respin"
  (cd "$R" && patch -p1 --forward --batch < "$RESPIN")
elif sums_ok "$C" "$BASE_SUMS"; then
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
else
  echo "error: $C is neither the 0035+0042 baseline nor 0048 (f3f1e748)" >&2; exit 1
fi
for m in "${MODS[@]}"; do
  cmp "$F/$m" "$C/$m" || { echo "error: $m differs from patches/0048-files after apply" >&2; exit 1; }
done

# ---- native gate (C++ + static pref)
if sums_ok "$R" "$GATE_POST"; then
  echo "0048r2 native gate already applied"
elif sums_ok "$R" "$GATE_BASE"; then
  (cd "$R" && patch -p1 --forward --batch < "$GATE")
else
  echo "error: native-gate files are neither stock 156.0.1 nor 0048r2" >&2
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$GATE_BASE")) || true
  exit 1
fi
sums_ok "$R" "$GATE_POST" || { echo "error: native-gate files differ from 0048r2 after apply" >&2; exit 1; }

grep -Fq 'DarkstrCookieCore' "$C/DarkstrCookieFirewall.sys.mjs"
grep -Fq 'installedByDocument' "$C/DarkstrCookieFirewallChild.sys.mjs"
grep -Fq '_holdUntilAcked' "$C/DarkstrCookieFirewall.sys.mjs"
grep -Fq 'darkstr-cookie-gate' "$C/DarkstrCookieFirewallChild.sys.mjs"
grep -Fq 'DarkstrContentGateBlocks(aDocument, cookiePrincipal)' "$R/netwerk/cookie/CookieCommons.cpp"
grep -Fq 'name: darkstr.cookieFirewall.contentGate' "$R/modules/libpref/init/StaticPrefList.yaml"
if grep -Fq 'matches: ["*://*/*"]' "$C/DarkstrCookieFirewall.sys.mjs"; then
  echo "error: actor still restricted to *://*/*" >&2; exit 1
fi
echo "0048 (r2) applied. C++ + new pref group changed → backend regen + libxul relink."
echo "Build (objdir pinned; never a bare mach build):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
