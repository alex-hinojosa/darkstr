#!/usr/bin/env bash
# Mini verify for M-FFI-0008 Approach B. Run on Alexander's Mac mini (SSD).
# Brand: darkstr — not official LibreWolf.
set -euo pipefail

echo "## M-FFI-0008 Mini verify"
if [[ -f "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
fi
: "${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}"

echo "ROOT=$DARKSTR_GECKO_ROOT"
test -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs"
grep -q "_readSnapshotFromFfi" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
grep -q "DarkstrFfi.sys.mjs" "${DARKSTR_GECKO_ROOT}/browser/components/moz.build"
test -d "${DARKSTR_GECKO_ROOT}/third_party/darkstr/duppel-ffi"

echo "## markers OK"

OBJBIN=""
if [[ -n "${DARKSTR_GECKO_OBJDIR:-}" ]]; then
  OBJBIN="${DARKSTR_GECKO_OBJDIR}/dist/bin"
else
  OBJBIN="$(ls -d "${DARKSTR_GECKO_ROOT}"/obj-*/dist/bin 2>/dev/null | head -n1 || true)"
fi

if [[ -n "${OBJBIN}" && -d "${OBJBIN}" ]]; then
  echo "## build-and-install-ffi --prefix ${OBJBIN}"
  chmod +x "${DARKSTR_GECKO_ROOT}/third_party/darkstr/build-and-install-ffi.sh"
  "${DARKSTR_GECKO_ROOT}/third_party/darkstr/build-and-install-ffi.sh" --prefix "${OBJBIN}"
  echo "FFI_BUILD_EXIT=$?"
  DYLIB="${OBJBIN}/libduppel_ffi.dylib"
  if [[ -f "${DYLIB}" ]]; then
    echo "## nm"
    nm -gU "${DYLIB}" | grep darkstr_ffi_ || true
    echo "## otool"
    otool -L "${DYLIB}" | head -n 8 || true
  else
    echo "WARN: dylib missing at ${DYLIB}"
  fi
else
  echo "WARN: no objdir dist/bin — skip FFI install (set DARKSTR_GECKO_OBJDIR)"
fi

echo "## mach build browser/components (record EXIT manually if you run it)"
echo "cd \"$DARKSTR_GECKO_ROOT\" && ./mach build browser/components"
echo "## M-FFI-0008 Mini verify script finished (tree markers checked)"
