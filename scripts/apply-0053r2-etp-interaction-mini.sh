#!/usr/bin/env bash
# darkstr 0053r2 apply (Proof follow-up to 0053, merged in #85): leaving Pollution
# restores privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings
# to its pre-Pollution state. Stock Gecko sets it on every
# browser.contentblocking.category change, and FPP=false under Pollution makes
# ContentBlockingPrefs flip the category (strict -> custom and back), so darkstr
# cannot avoid the trigger. It saves the flag with the other pre-Pollution prefs
# and restores it after the flip back (plus one idle pass). Off mode still
# writes nothing.
# Needs 0053 applied (ModeXor at the 0053 baseline). Chrome JS only -> no C++ recompile.
# Independent of 0055 (different file); the 0055 respin build carries both.
# usage: scripts/apply-0053r2-etp-interaction-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0053r2-files"
PATCH="$HERE/patches/0053r2-darkstr-etp-interaction.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=("DarkstrModeXor.sys.mjs:browser/components/DarkstrModeXor.sys.mjs")
(cd "$F" && shasum -a 256 -c SHA256SUMS)
BASE_SUMS="1b5ee85df9143122a3420c4935fff6888f332e6ea42a4d73beaaa983c46bd4d5  browser/components/DarkstrModeXor.sys.mjs"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0053r2 already applied — tree matches patches/0053r2-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R ModeXor is not the 0053 copy 0053r2 was cut against (run apply-0053 first)" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0053r2-files after apply" >&2; exit 1; }
done
M="$R/browser/components/DarkstrModeXor.sys.mjs"
grep -Fq 'const RESTORE_ONLY_PREFS = Object.freeze([ETP_INTERACTED_PREF]);' "$M"
grep -Fq '"privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings"' "$M"
echo "0053r2 applied. Build (objdir pinned; never a bare mach build; chrome JS only):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
