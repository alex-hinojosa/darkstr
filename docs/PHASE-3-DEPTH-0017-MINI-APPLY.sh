#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 pin 2 — apply/refresh 0017 depth canvas/WebGL/Audio + incremental browser/components build.
# Carries pin 1 install-dist_bin lesson (subdirectory mach alone can skip new MOZ_SRC).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0017-darkstr-depth-canvas-webgl-audio.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
else
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi

# If 0017 was already applied, apply-script markers skip. Refresh the three
# new-file modules (and chrome if missing waive/pageshow/lastError) from this tip.
python3 - "${PATCH}" "${DARKSTR_GECKO_ROOT}" <<'PY'
import sys
from pathlib import Path
patch, root = Path(sys.argv[1]), Path(sys.argv[2])
text = patch.read_text()
files = {}
cur = None
body = []
for line in text.splitlines(True):
    if line.startswith('+++ b/'):
        if cur and body:
            files[cur] = ''.join(body)
        cur = line[6:].strip()
        body = []
        continue
    if cur is None:
        continue
    if line.startswith('@@'):
        continue
    if line.startswith('--- ') or line.startswith('diff '):
        continue
    if line.startswith('+'):
        body.append(line[1:])
    elif line.startswith('\\'):
        continue
    elif line.startswith(' '):
        body.append(line[1:])
if cur and body:
    files[cur] = ''.join(body)
wanted = [
    "browser/components/DarkstrDepthHooks.sys.mjs",
    "browser/components/DarkstrDepthHooksChild.sys.mjs",
    "browser/components/DarkstrDepthHooksParent.sys.mjs",
]
for rel in wanted:
    src = files.get(rel)
    if not src:
        raise SystemExit(f"patch missing {rel}")
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(src)
    print(f"refreshed {dest}")
PY

test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksParent.sys.mjs"
grep -Fq 'DarkstrDepthHooks' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs"
grep -Fq 'Cu.waiveXrays' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooksChild.sys.mjs"
grep -Fq 'pageshow' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq 'darkstr.depth.lastError' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
grep -Fq '_readPersonaSeedPref' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrDepthHooks.sys.mjs"
cd "${DARKSTR_GECKO_ROOT}"
./mach build --allow-subdirectory-build browser/components
echo "mach EXIT=$?"

# Subdirectory build compiles/wires BrowserGlue but may NOT install new MOZ_SRC
# files into dist. Force dist_bin install, then mirror into LibreWolf.app.
OBJ="${DARKSTR_GECKO_ROOT}/obj-aarch64-apple-darwin25.6.0"
rm -f "${OBJ}/install_dist_bin.track"
( cd "${OBJ}" && make install-dist_bin )
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
BIN_DIR="${OBJ}/dist/bin/moz-src/browser/components"
APP_DIR="${OBJ}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
for mod in DarkstrDepthHooks.sys.mjs DarkstrDepthHooksChild.sys.mjs DarkstrDepthHooksParent.sys.mjs; do
  test -e "${BIN_DIR}/${mod}"
  if [[ ! -e "${APP_DIR}/${mod}" ]]; then
    ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
  fi
  test -e "${APP_DIR}/${mod}"
done
echo "Markers: DarkstrDepthHooks* in source + dist/bin + LibreWolf.app. Check about:config darkstr.depth.lastInstall / lastError. Hooks remain default-off. Workers not claimed."
