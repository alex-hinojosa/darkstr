#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 3 pin 3 — apply/refresh 0018 worker globals coherence + incremental browser/components build.
# Carries pin 1 install-dist_bin lesson + pin 2 module-refresh lesson (subdirectory mach alone can skip new MOZ_SRC;
# re-apply over stale new-file modules fails — refresh first so markers succeed).
# Soft residual lastInstall/HW fixes are baked into this patch body (also shipped as 0019).
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
if [[ ! -d "${REPO}" ]]; then
  REPO="${HOME}/src/darkstr"
fi
PATCH="${REPO}/patches/0018-darkstr-worker-globals-coherence.patch"
APPLY="${REPO}/patches/scripts/apply-darkstr-patches.sh"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "REPO=${REPO}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${PATCH}"

# Refresh 0018 new-file modules first. Mini may already have a stale 0018;
# applying the updated unified diff over existing files fails. Extracting the
# three new-file hunks makes later apply-script markers succeed and skip.
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
    "browser/components/DarkstrWorkerHooks.sys.mjs",
    "browser/components/DarkstrWorkerHooksChild.sys.mjs",
    "browser/components/DarkstrWorkerHooksParent.sys.mjs",
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

test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksParent.sys.mjs"
grep -Fq 'DarkstrWorkerHooks' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs" || true
grep -Fq 'Cu.waiveXrays' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'runtimeOnly' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq '_reportRuntime' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooksChild.sys.mjs"
grep -Fq 'pageshow' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'darkstr.worker.lastError' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq '_readPersonaSeedPref' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"
grep -Fq 'safeForUntrustedWebProcess' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrWorkerHooks.sys.mjs"

# Module refresh above can make patch think 0018 is fully applied while
# BrowserGlue / moz.build still lack WorkerHooks. Force those hunks.
patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}" || true
rm -f "${DARKSTR_GECKO_ROOT}/browser/components/"*.rej
if ! grep -Fq 'DarkstrWorkerHooks' "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs"   || ! grep -Fq 'DarkstrWorkerHooks.sys.mjs' "${DARKSTR_GECKO_ROOT}/browser/components/moz.build"; then
  echo "ERROR: BrowserGlue/moz.build missing DarkstrWorkerHooks after force apply" >&2
  exit 1
fi
if [[ -f "${APPLY}" ]]; then
  bash "${APPLY}" --require-root
fi

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
for mod in DarkstrWorkerHooks.sys.mjs DarkstrWorkerHooksChild.sys.mjs DarkstrWorkerHooksParent.sys.mjs; do
  test -e "${BIN_DIR}/${mod}"
  if [[ ! -e "${APP_DIR}/${mod}" ]]; then
    ln -sf "${COMP}/${mod}" "${APP_DIR}/${mod}"
  fi
  test -e "${APP_DIR}/${mod}"
done
echo "Markers: DarkstrWorkerHooks* in source + dist/bin + LibreWolf.app. Check about:config darkstr.worker.lastInstall / lastError. Hooks remain default-off. ServiceWorker/Worklets not claimed."
