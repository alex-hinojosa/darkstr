#!/usr/bin/env bash
# darkstr 0051 apply: persona surface (Rowan QA N2–N5). Run on the Mini.
#   N2 per-tab / per-document persona phase (no global docShellPhase read;
#      C++ global UA override retired), N3 per-request Accept-Language from the
#      top site's persona (no intl.accept_languages writes), N4 no
#      deviceMemory/userAgentData + prototype-level native-shaped navigator and
#      cookie hooks, N5 seed never writes darkstr.persona.snapshot.
# Stacked on 0048 (cookie firewall correctness): needs 0048 applied.
# Touches chrome JS + dom/base/Navigator.cpp + netwerk DarkstrNsHttpHooks
# (libxul relink).
# usage: scripts/apply-0051-persona-surface-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0051-files"
PATCH="$HERE/patches/0051-darkstr-persona-surface.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
# file in patches/0051-files → path in the tree
MAP=(
  "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
  "DarkstrNativePersonaChild.sys.mjs:browser/components/DarkstrNativePersonaChild.sys.mjs"
  "DarkstrNativePersonaParent.sys.mjs:browser/components/DarkstrNativePersonaParent.sys.mjs"
  "DarkstrCookieFirewallChild.sys.mjs:browser/components/DarkstrCookieFirewallChild.sys.mjs"
  "Navigator.cpp:dom/base/Navigator.cpp"
  "DarkstrNsHttpHooks.cpp:netwerk/protocol/http/DarkstrNsHttpHooks.cpp"
  "DarkstrNsHttpHooks.h:netwerk/protocol/http/DarkstrNsHttpHooks.h"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# 0048-applied baseline the patch was cut against.
BASE_SUMS="feac9fdc4cc63959de4f0ad3e3a65613806a13f5659ca5d9dd4ea9dab0dc8528  browser/components/DarkstrCookieFirewallChild.sys.mjs
925a38cc6369893e6e4044863e89beb9a373503327640afa8a84b0b2cbb8138f  browser/components/DarkstrNativePersona.sys.mjs
84c6b35433c8718c28b5a012b058cea68e68216ecea37620784e125180589d36  browser/components/DarkstrNativePersonaChild.sys.mjs
f466af10e41f56b027f67ccd068070513ce2fbac4598a4717375159fcc81c371  browser/components/DarkstrNativePersonaParent.sys.mjs
2cfa92b5dd1ffa053d2b03da415eb4ee4e1eab063eee997af29a321f25076ae9  dom/base/Navigator.cpp
53cc9866245a3e4a8b4683fc4f8b95dd5389840096dd0c0857069183d0ee3e64  netwerk/protocol/http/DarkstrNsHttpHooks.cpp
69fd6b32d959c43800e61ff293c14d8bdb7d4659af36485d4f7e33a43efe1495  netwerk/protocol/http/DarkstrNsHttpHooks.h"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0051 already applied — tree matches patches/0051-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the 0048-applied baseline 0051 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0051-files after apply" >&2; exit 1; }
done
C="$R/browser/components"
grep -Fq 'decisionForChannel' "$C/DarkstrNativePersona.sys.mjs"
grep -Fq 'Navigator?.prototype' "$C/DarkstrNativePersonaChild.sys.mjs"
grep -Fq 'protoOwning' "$C/DarkstrCookieFirewallChild.sys.mjs"
if grep -Eq 'darkstrNavGetter|"deviceMemory"|"userAgentData"' "$C/DarkstrNativePersonaChild.sys.mjs"; then
  echo "error: Chrome-only navigator surface still present" >&2; exit 1
fi
if grep -Fq 'DarkstrNavigatorHooks::TryGet' "$R/dom/base/Navigator.cpp"; then
  echo "error: global-pref Navigator hooks still compiled in" >&2; exit 1
fi
echo "0051 applied. Build (objdir pinned; never a bare mach build; C++ changed → libxul relink):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
