#!/usr/bin/env bash
# darkstr 0053 apply: off mode leaves prefs alone (Fable QA B5).
#   Homogeneous (off) writes nothing: no privacy.* / webgl.* / gfx.* user
#   values, and darkstr.pollutionActive is only written while Pollution is on.
#   Entering Pollution saves the user's privacy.resistFingerprinting /
#   privacy.fingerprintingProtection / librewolf.webgl.prompt state (user value
#   or none) in darkstr.xor.savedPrefs; leaving restores exactly that.
#   WebGL is unlocked only under Pollution and only via the LibreWolf prompt
#   gate (librewolf.webgl.prompt=false): no webgl.force-enabled, no
#   gfx.blocklist.all, no forbid-* overrides; the GPU blocklist applies.
#   librewolf.cfg: the darkstr-0029-webgl block (old :959-974) is removed.
#   Profiles a pre-0053 build ran are migrated once (clear-only of the old
#   forced WebGL values; marker darkstr.xor.migrated0053).
# Stacked on builder/0052-no-diag-prefs @ 0ba3eb03 — needs 0052 applied first.
# Chrome JS + librewolf.cfg only → no C++ recompile.
# usage: scripts/apply-0053-off-mode-hands-off-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0053-files"
PATCH="$HERE/patches/0053-darkstr-off-mode-hands-off.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
# file in patches/0053-files → path in the tree
MAP=(
  "DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs"
  "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
  "librewolf.cfg:lw/librewolf.cfg"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# Tree baseline the patch was cut against (0052 applied).
BASE_SUMS="ecdcb539136151303ced50fcdfc6e2e93f057682fcc6abf44bda14cf9254ed5b  browser/components/DarkstrModeXor.sys.mjs
fbc1ea181021389d035e76d254d4f3da8b8aa2222fde4d8f34995b2dc3956000  browser/components/DarkstrNativePersona.sys.mjs
a3a0b307da5d463e573e8e8627d729e7c6a9d7056688385c84aa1ef7a40d8b86  lw/librewolf.cfg"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0053 already applied — tree matches patches/0053-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the 0052-applied baseline 0053 was cut against (run apply-0052 first)" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0053-files after apply" >&2; exit 1; }
done
M="$R/browser/components/DarkstrModeXor.sys.mjs"
N="$R/browser/components/DarkstrNativePersona.sys.mjs"
CFG="$R/lw/librewolf.cfg"
grep -Fq 'const SAVED_PREF = "darkstr.xor.savedPrefs";' "$M"
grep -Fq '_leavePollution(' "$M"
grep -Fq 'if (pollutionActive) {' "$N"
if grep -Eq '_ensureWebGlContextPrefs|lockPref\(|set(Bool|Int)Pref\(\s*(WEBGL_FORCE_ENABLED_PREF|GFX_BLOCKLIST_ALL_PREF|WEBGL_FORBID_\w+)' "$M"; then
  echo "error: ModeXor still forces WebGL / overrides the GPU blocklist" >&2; exit 1
fi
if grep -Eq 'darkstr-0029-webgl|"webgl\.force-enabled"|"gfx\.blocklist\.all"|"librewolf\.webgl\.prompt' "$CFG"; then
  echo "error: librewolf.cfg still carries the darkstr-0029-webgl block" >&2; exit 1
fi
echo "0053 applied. Build (objdir pinned; never a bare mach build; chrome JS + cfg only):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
