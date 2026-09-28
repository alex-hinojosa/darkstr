#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Historical Approach B cdylib installer — **RETIRED for product runtime (0041)**.
# Brand: darkstr — not official LibreWolf.
#
# Product Pollution FFI path is Approach A only (libxul/XUL-resident darkstr_ffi_*
# via gkrust; see docs/M-FFI-0040-STATUS.md + docs/M-FFI-0041-STATUS.md).
# This script no longer installs libduppel_ffi for Pollution. Soft-fail → JS mulberry
# when A is missing. Crate may still build cdylib for unit tests offline.
#
# Override (dev/unit-test only): DARKSTR_FFI_ALLOW_B_INSTALL=1
# Does NOT run mach package / DMG. Does NOT flip nativePersonaHooks.
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"

if [[ -f "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
fi
: "${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}"

echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "disk:"; df -h / | tail -n1

if [[ "${DARKSTR_FFI_ALLOW_B_INSTALL:-0}" != "1" ]]; then
  cat <<'MSG'
PHASE-4-FFI-MINI-INSTALL: Approach B cdylib install is RETIRED for product (0041).
  Product path: Approach A only — darkstr_ffi_* in libxul/XUL (see M-FFI-0040 / M-FFI-0041).
  Soft-fail when A missing → JS mulberry. Do not side-load libduppel_ffi for Pollution.
  Dev/unit-test override: DARKSTR_FFI_ALLOW_B_INSTALL=1 $0
  Apply A if needed: ./docs/M-FFI-0040-MINI-APPLY.sh
MSG
  exit 0
fi

echo "WARN: DARKSTR_FFI_ALLOW_B_INSTALL=1 — building Approach B cdylib (non-product)"
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

echo "Building Approach B cdylib → ${PREFIX} (override path; chrome will not load it post-0041)"
"${SCRIPT}" --prefix "${PREFIX}"

DYLIB="${PREFIX}/libduppel_ffi.dylib"
test -f "${DYLIB}"
echo "## verify"
ls -la "${DYLIB}"
file "${DYLIB}"
otool -L "${DYLIB}" | head -n 8
nm -gU "${DYLIB}" | grep darkstr_ffi_ || nm -g "${DYLIB}" | grep darkstr_ffi_ || true

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

echo "PHASE-4-FFI-MINI-INSTALL: EXIT=0 (B override; product runtime is A-only)"
