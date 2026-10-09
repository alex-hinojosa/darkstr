#!/usr/bin/env bash
# darkstr 0050 apply: chaff rearm (Rowan B6). Run on the Mini.
#   DarkstrChaffScheduler._onIntervalFire scheduled a batch and then re-armed
#   the interval through _cancelAll, which cancelled that batch — no chaff
#   ever fired. The re-arm now replaces only the interval timer
#   (_cancelIntervalTimer); pending batch timers survive and fire. _cancelAll
#   (= interval + batch) still runs when chaff is disabled, the gate/level
#   prefs change (refreshPlan) and on uninit; fired one-shot batch timers
#   leave the pending list. Schedules, endpoints, payloads and defaults are
#   unchanged.
# Stacked on 0049 (worker coherence); the scheduler itself is unchanged since
# 0024, so the baseline is the 0024 scheduler.
# Touches chrome JS only (browser/components) → no C++ recompile.
# usage: scripts/apply-0050-chaff-rearm-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0050-files"
PATCH="$HERE/patches/0050-darkstr-chaff-rearm.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
# file in patches/0050-files → path in the tree
MAP=(
  "DarkstrChaffScheduler.sys.mjs:browser/components/DarkstrChaffScheduler.sys.mjs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# Baseline the patch was cut against (0024 scheduler; same bytes on 0049).
BASE_SUMS="9081edc1d5956da2fc807fdfe3da72880d5f373a177b08e0c0fe10a93ba63b32  browser/components/DarkstrChaffScheduler.sys.mjs"
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0050 already applied — tree matches patches/0050-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the baseline 0050 was cut against" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0050-files after apply" >&2; exit 1; }
done
S="$R/browser/components/DarkstrChaffScheduler.sys.mjs"
grep -Fq '_cancelIntervalTimer()' "$S"
grep -Fq '_cancelBatchTimers()' "$S"
# The re-arm must not cancel batches any more (B6).
if awk '/_armIntervalTimer\(plan\) \{/{f=1;next} f&&/^  \},?$/{f=0} f' "$S" | grep -Fq '_cancelAll()'; then
  echo "error: _armIntervalTimer still calls _cancelAll (B6)" >&2; exit 1
fi
echo "0050 applied. Build (objdir pinned; never a bare mach build; chrome JS only):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
