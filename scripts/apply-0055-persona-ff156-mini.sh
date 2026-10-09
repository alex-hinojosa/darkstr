#!/usr/bin/env bash
# darkstr 0055 apply: personas claim the engine's Firefox version (N6, Alex's call),
# plus O9 (native-persona fallback table); O12 r2 (worker Intl locale == page).
#   N6  Rust duppel-persona: UA tables are built by firefox_ua!(os) from
#       config/milestone.txt at build time (build.rs; fallback gecko-milestone.txt
#       outside a Gecko tree). No rv:139/140 literals remain. FFI JSON gains appVersion
#       ("5.0 (Macintosh)" etc., Firefox semantics); DarkstrFfi passes it through.
#       Chrome DarkstrNativePersona: version from Services.appinfo.version at runtime;
#       FFI snapshots that claim another version are rejected; an operator-locked
#       snapshot's UA is rewritten to the engine version.
#   O9  Fallback (native lib failed to load) = exact port of the Rust draw order and
#       tables, timezone included; same seed + OS → same persona as Rust.
#   O12 r2 (Proof review of #86): Intl stays the app locale in pages AND workers, as
#       in stock. r1 overrode only the worker locale (mLanguageOverrideLocale), a
#       page/worker split; 0055 r2 ships no C++ and puts a tree that has r1 applied
#       back to the 0049 DarkstrNavigatorHooks.cpp.
# Stacked on builder/0053-off-mode-hands-off @ 09062b32 — needs 0053 applied first.
# Rust (libxul gkrust) + chrome JS (+ dom/base recompile when undoing r1) → libxul relinks.
# usage: scripts/apply-0055-persona-ff156-mini.sh   (needs DARKSTR_GECKO_ROOT)
# Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; F="$HERE/patches/0055-files"
PATCH="$HERE/patches/0055-darkstr-persona-ff156.patch"
: "${DARKSTR_GECKO_ROOT:?source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env}"
R="$DARKSTR_GECKO_ROOT"
MAP=(
  "DarkstrNativePersona.sys.mjs:browser/components/DarkstrNativePersona.sys.mjs"
  "DarkstrFfi.sys.mjs:browser/components/DarkstrFfi.sys.mjs"
  "duppel-persona-lib.rs:third_party/darkstr/duppel-persona/src/lib.rs"
  "duppel-persona-build.rs:third_party/darkstr/duppel-persona/build.rs"
  "gecko-milestone.txt:third_party/darkstr/duppel-persona/gecko-milestone.txt"
  "duppel-ffi-lib.rs:third_party/darkstr/duppel-ffi/src/lib.rs"
)
(cd "$F" && shasum -a 256 -c SHA256SUMS)
# Tree baseline the patch was cut against (0053 applied).
BASE_SUMS="42ba4a4b79a6c6df044be10e8c0ad4ac726587f7b31473bc21e514598e7674c6  browser/components/DarkstrNativePersona.sys.mjs
243ea9368adf113b356fb9e562d1f7b7fabe4c731a42b06b5009c4bcca0dfdd0  browser/components/DarkstrFfi.sys.mjs
4b3973b9b6e0c90b7c32f0042db95f72a50fa95bf22b5bf899ed84b3ff296ad3  dom/base/DarkstrNavigatorHooks.cpp
5fd89e38319af5cabed899613dbe5a3344f4669d7f15c39bcb0a3a4fd2679d21  third_party/darkstr/duppel-persona/src/lib.rs
6d646972107a33110a2267d040032ff9f1495ff1efc272c2167f71928b77d218  third_party/darkstr/duppel-persona/Cargo.toml
2f1415cd4e6d5f679f0abd40125c028d048d0b2c92773baabdb3a65f50258a3f  third_party/darkstr/duppel-ffi/src/lib.rs"
H="$R/dom/base/DarkstrNavigatorHooks.cpp"
# r1 → r2: r1 changed DarkstrNavigatorHooks.cpp (worker-only Intl locale). Put
# the 0049 copy (== the baseline below) back before anything else.
R1_HOOKS=2219e76d91536db7116638a650547e46fce722307ff899ae2871dcf701a3cf96
if [[ "$(shasum -a 256 "$H" | cut -d' ' -f1)" == "$R1_HOOKS" ]]; then
  cp "$HERE/patches/0049-files/DarkstrNavigatorHooks.cpp" "$H"
  echo "0055 r1 hooks C++ found — restored patches/0049-files/DarkstrNavigatorHooks.cpp (O12 r2)"
fi
already=1
for e in "${MAP[@]}"; do cmp -s "$F/${e%%:*}" "$R/${e#*:}" || already=0; done
if [[ $already == 1 ]]; then
  echo "0055 already applied — tree matches patches/0055-files"
else
  (cd "$R" && shasum -a 256 -c <(printf '%s\n' "$BASE_SUMS")) \
    || { echo "error: $R is not the 0053-applied baseline 0055 was cut against (run apply-0053 first)" >&2; exit 1; }
  (cd "$R" && patch -p1 --forward --batch < "$PATCH")
fi
for e in "${MAP[@]}"; do
  cmp "$F/${e%%:*}" "$R/${e#*:}" || { echo "error: ${e#*:} differs from patches/0055-files after apply" >&2; exit 1; }
done
cmp "$HERE/patches/0049-files/DarkstrNavigatorHooks.cpp" "$H" || { echo "error: dom/base/DarkstrNavigatorHooks.cpp is not the 0049 copy" >&2; exit 1; }
N="$R/browser/components/DarkstrNativePersona.sys.mjs"
P="$R/third_party/darkstr/duppel-persona"
grep -Fq 'Services.appinfo.version' "$N"
grep -Fq 'export function generatePersonaFallback(' "$N"
if grep -q 'mLanguageOverrideLocale' "$H"; then
  echo "error: worker Intl locale override present (page/worker split, O12 r2)" >&2; exit 1
fi
grep -Fq 'parsed.appVersion' "$R/browser/components/DarkstrFfi.sys.mjs"
grep -Fq 'include!(concat!(env!("OUT_DIR"), "/engine_version.rs"));' "$P/src/lib.rs"
[[ -f "$P/build.rs" && -f "$R/config/milestone.txt" ]]
if grep -Eq '"Mozilla/5\.0 \([^"]*(rv:1[0-9]{2}\.0|Firefox/1[0-9]{2}\.0)' "$N" "$P/src/lib.rs"; then
  echo "error: hard-coded Firefox UA literal still present (N6)" >&2; exit 1
fi
echo "0055 applied (engine milestone $(grep -v '^#' "$R/config/milestone.txt" | tail -1))."
echo "Build (objdir pinned; never a bare mach build; Rust + chrome JS, dom/base if r1 was undone):"
echo "  cd \$DARKSTR_GECKO_ROOT && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach build && MOZ_OBJDIR=\$DARKSTR_GECKO_ROOT/obj-aarch64-apple-darwin25.6.0 ./mach package"
