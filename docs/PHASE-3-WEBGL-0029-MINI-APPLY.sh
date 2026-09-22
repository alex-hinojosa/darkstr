#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 soft residual (0029) — enable live WebGL context (LibreWolf hardening undo).
# Tip-up: gfx.blocklist.all=-1 + nsIGfxInfo status; tip-up2: librewolf.webgl.prompt=false
# (LW IsWebGLAllowed doorhanger — real gate behind "WebGL is currently disabled.").
# Also librewolf.webgl.prompt.hide=true (secondary). Chrome JS only — no XUL relink.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
PATCH="${REPO}/patches/0029-darkstr-webgl-context-enable.patch"
UPGRADE_PY="${REPO}/docs/PHASE-3-WEBGL-0029-UPGRADE-MODEXOR.py"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
MODEXOR="${COMP}/DarkstrModeXor.sys.mjs"
LW_CFG="${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
test -f "${PATCH}"

ensure_0029_enriched() {
  grep -Fq 'Soft residual (0029)' "${MODEXOR}" \
    && grep -Fq '_ensureWebGlContextPrefs' "${MODEXOR}" \
    && grep -Fq 'gfx.blocklist.all' "${MODEXOR}" \
    && grep -Fq '_gfxFeatureStatusSnippet' "${MODEXOR}" \
    && grep -Fq 'librewolf.webgl.prompt' "${MODEXOR}"
}

if ensure_0029_enriched; then
  echo "0029 enriched+prompt markers already present — skip patch apply"
elif grep -Fq '_ensureWebGlContextPrefs' "${MODEXOR}" 2>/dev/null; then
  echo "0029 present without prompt tip-up — surgical upgrade from patch"
  python3 "${UPGRADE_PY}" "${MODEXOR}" "${PATCH}"
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi

ensure_0029_enriched
grep -Fq 'Soft residual (0029)' "${MODEXOR}"
grep -Fq '_ensureWebGlContextPrefs' "${MODEXOR}"
grep -Fq 'gfx.blocklist.all' "${MODEXOR}"
grep -Fq 'librewolf.webgl.prompt' "${MODEXOR}"

# Product cfg before gfx init (mirror:once / AtStartup). Never set blocklist.all=+1.
if [[ -f "${LW_CFG}" ]]; then
  if ! grep -Fq 'darkstr-0029-webgl' "${LW_CFG}"; then
    cat >> "${LW_CFG}" << 'CFG'

// BEGIN darkstr-0029-webgl — Firefox-coherent WebGL (undo LibreWolf null-context hardening)
// gfx.blocklist.all=-1 ignores feature blocklisting; +1 forces block-all (never set +1).
// Pref is AtStartup / mirror:once — must land in cfg before gfx init.
// librewolf.webgl.prompt=false unlocks LW IsWebGLAllowed doorhanger gate
// (StaticPrefs::librewolf_webgl_prompt; Err "WebGL is currently disabled.").
unlockPref("webgl.disabled");
defaultPref("webgl.disabled", false);
unlockPref("webgl.force-enabled");
defaultPref("webgl.force-enabled", true);
unlockPref("gfx.blocklist.all");
defaultPref("gfx.blocklist.all", -1);
unlockPref("librewolf.webgl.prompt");
defaultPref("librewolf.webgl.prompt", false);
unlockPref("librewolf.webgl.prompt.hide");
defaultPref("librewolf.webgl.prompt.hide", true);
// END darkstr-0029-webgl
CFG
    echo "Appended darkstr-0029-webgl block to lw/librewolf.cfg"
  elif ! grep -Fq 'librewolf.webgl.prompt' "${LW_CFG}"; then
    python3 - "${LW_CFG}" << 'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
t = p.read_text()
needle = "// END darkstr-0029-webgl"
insert_parts = []
if "gfx.blocklist.all" not in t:
    insert_parts += [
        'unlockPref("gfx.blocklist.all");',
        'defaultPref("gfx.blocklist.all", -1);',
    ]
insert_parts += [
    'unlockPref("librewolf.webgl.prompt");',
    'defaultPref("librewolf.webgl.prompt", false);',
    'unlockPref("librewolf.webgl.prompt.hide");',
    'defaultPref("librewolf.webgl.prompt.hide", true);',
    "// END darkstr-0029-webgl",
]
insert = "\n".join(insert_parts)
if needle not in t:
    raise SystemExit("END marker missing")
p.write_text(t.replace(needle, insert, 1))
print("Inserted librewolf.webgl.prompt(+hide) into darkstr-0029-webgl block")
PY
  else
    echo "lw/librewolf.cfg already has darkstr-0029-webgl + prompt — skip"
  fi
fi

if [[ -f "${REPO}/patches/stubs/darkstr.cfg" ]]; then
  cp "${REPO}/patches/stubs/darkstr.cfg" "${DARKSTR_GECKO_ROOT}/lw/darkstr.cfg"
fi

cd "${DARKSTR_GECKO_ROOT}"
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_MACH_SITE=1
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_BUILD_SITE=1
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=system
PATH="/usr/bin:${PATH}" ./mach build --allow-subdirectory-build browser/components
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
mkdir -p "${APP_DIR}"
ln -sfn "${COMP}/DarkstrModeXor.sys.mjs" "${APP_DIR}/DarkstrModeXor.sys.mjs"
DIST_CFG="${OBJ}/dist/LibreWolf.app/Contents/Resources/librewolf.cfg"
if [[ -f "${LW_CFG}" && -d "$(dirname "${DIST_CFG}")" ]]; then
  cp "${LW_CFG}" "${DIST_CFG}" || true
fi
echo "0029 installed (enriched+prompt). Proof: librewolf.webgl.prompt=false; getContext non-null Homogeneous+Pollution; blocklist.all=-1 (never +1); status=2 is UNKNOWN; UNMASKED Apple/M2 + caps; no P0/P1 regress; darkstr.webgl.lastStatus includes librewolf.webgl.prompt=."
