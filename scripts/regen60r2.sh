#!/bin/bash
# 0060r2: regenerate the DarkstrCookieFirewall section of the 0060 patch
# (base = 0056's copy, per BASE_SHA256SUMS) and its SHA256SUMS line.
set -euo pipefail
cd "$(dirname "$0")/.."
P=patches/0060-darkstr-cookie-firewall-coverage.patch
F=browser/components/DarkstrCookieFirewall.sys.mjs
BASE=patches/0056-files/DarkstrCookieFirewall.sys.mjs
NEW=patches/0060-files/DarkstrCookieFirewall.sys.mjs
grep -q "^$(shasum -a 256 $BASE | cut -d' ' -f1)  $F$" patches/0060-files/BASE_SHA256SUMS
next=$(grep -n '^--- a/' $P | sed -n 2p | cut -d: -f1)
{ diff -u --label a/$F --label b/$F $BASE $NEW || true; tail -n +"$next" $P; } > $P.tmp && mv $P.tmp $P
sum=$(shasum -a 256 $NEW | cut -d' ' -f1)
sed -i '' -E "s/^[0-9a-f]{64}  DarkstrCookieFirewall.sys.mjs$/$sum  DarkstrCookieFirewall.sys.mjs/" patches/0060-files/SHA256SUMS
grep DarkstrCookieFirewall patches/0060-files/SHA256SUMS
