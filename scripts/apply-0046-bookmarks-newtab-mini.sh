#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Pin 0046 — bookmarks toolbar default back to stock Firefox ("newtab": shown only on the
#   new tab page). Pref default only (librewolf.cfg defaultPref), no lock, no engine change.
# Requires pin 0045 applied. Incremental build with the 25.6.0 objdir (librewolf.cfg only).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
OVERLAY="${REPO}/patches/0046-files"
ROOT="${DARKSTR_GECKO_ROOT}"
CFG="${ROOT}/lw/librewolf.cfg"
echo "DARKSTR_GECKO_ROOT=${ROOT}"
test -f "${OVERLAY}/librewolf-cfg-0046.snippet"
test -f "${CFG}"
grep -q 'BEGIN darkstr-0045-branding' "${CFG}" || { echo "pin 0045 not applied" >&2; exit 1; }
python3 - "${CFG}" "${OVERLAY}/librewolf-cfg-0046.snippet" <<'PY'
import re, sys
cfg, snip = sys.argv[1], open(sys.argv[2]).read().rstrip("\n")
t = open(cfg).read()
lw = 'defaultPref("browser.toolbars.bookmarks.visibility", "always");'
blk = re.compile(r"// BEGIN darkstr-0046-bookmarks-newtab\n.*?// END darkstr-0046-bookmarks-newtab", re.S)
if blk.search(t):
    t = blk.sub(lambda m: snip, t, count=1)
elif t.count(lw) == 1:
    t = t.replace(lw, snip, 1)
else:
    sys.exit("librewolf.cfg: LibreWolf bookmarks visibility line not found exactly once")
assert '"always"' not in "".join(l for l in t.splitlines(True) if "bookmarks.visibility" in l and not l.lstrip().startswith("//"))
assert t.count('defaultPref("browser.toolbars.bookmarks.visibility", "newtab");') == 1
assert 'lockPref("browser.toolbars.bookmarks.visibility"' not in t
open(cfg, "w").write(t)
print("librewolf.cfg: bookmarks toolbar visibility -> newtab (defaultPref)")
PY
grep -n 'bookmarks.visibility' "${CFG}"
cat <<MSG
Build (incremental; 25.6.0 objdir only):
  cd "${ROOT}" && MOZ_OBJDIR="${ROOT}/obj-aarch64-apple-darwin25.6.0" ./mach build
  make -C "${ROOT}/obj-aarch64-apple-darwin25.6.0/browser/installer" stage-package
Do NOT ./mach package until the PM icon lands (scripts/darkstr-icon-from-png.sh).
MSG
