#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Phase 4 soft residual — restore Approach B libduppel_ffi into current train dist.
# Brand: darkstr — not official LibreWolf.
# Does NOT run mach package / DMG (disk-heavy). Does NOT touch fonts/speech/WebGPU.
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"

if [[ -f "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
fi
: "${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}"

echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "disk:"; df -h / | tail -n1

SCRIPT="${DARKSTR_GECKO_ROOT}/third_party/darkstr/build-and-install-ffi.sh"
test -f "${SCRIPT}"
test -d "${DARKSTR_GECKO_ROOT}/third_party/darkstr/duppel-ffi"
chmod +x "${SCRIPT}"

OBJDIR=""
if [[ -n "${DARKSTR_GECKO_OBJDIR:-}" ]]; then
  OBJDIR="${DARKSTR_GECKO_OBJDIR}"
else
  OBJDIR="$(ls -d "${DARKSTR_GECKO_ROOT}"/obj-* 2>/dev/null | head -n1 || true)"
fi
: "${OBJDIR:?no objdir — set DARKSTR_GECKO_OBJDIR or build once}"
PREFIX="${OBJDIR}/dist/bin"
test -d "${PREFIX}"

echo "Building Approach B cdylib → ${PREFIX}"
"${SCRIPT}" --prefix "${PREFIX}"

DYLIB="${PREFIX}/libduppel_ffi.dylib"
test -f "${DYLIB}"
echo "## verify"
ls -la "${DYLIB}"
file "${DYLIB}"
otool -L "${DYLIB}" | head -n 8
nm -gU "${DYLIB}" | grep darkstr_ffi_ || nm -g "${DYLIB}" | grep darkstr_ffi_ || true

# Mirror beside .app launch paths (parity with historical 155 install).
APP_MACOS="${OBJDIR}/dist/LibreWolf.app/Contents/MacOS"
APP_RES="${OBJDIR}/dist/LibreWolf.app/Contents/Resources"
if [[ -d "${APP_MACOS}" ]]; then
  cp "${DYLIB}" "${APP_MACOS}/"
  if command -v install_name_tool >/dev/null 2>&1; then
    install_name_tool -id "@executable_path/libduppel_ffi.dylib" "${APP_MACOS}/libduppel_ffi.dylib" || true
  fi
  echo "mirrored → ${APP_MACOS}/libduppel_ffi.dylib"
fi
if [[ -d "${APP_RES}" ]]; then
  cp "${DYLIB}" "${APP_RES}/"
  echo "mirrored → ${APP_RES}/libduppel_ffi.dylib"
fi

echo "PHASE-4-FFI-MINI-INSTALL: EXIT=0"
echo "Skip mach package/DMG unless free disk >25Gi; keep Gecko objdir."
