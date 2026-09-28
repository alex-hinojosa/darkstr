#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Approach A — apply 0040 gkrust→libxul pin, rebuild toolkit/library, symbol smoke.
# Brand: darkstr — not official LibreWolf.
# Does NOT merge. Does NOT flip nativePersonaHooks. Does NOT package DMG.
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"

if [[ -f "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
fi
: "${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="${REPO}/patches/0040-darkstr-ffi-gkrust-libxul.patch"
test -f "${PATCH}"

echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "disk before:"; df -h / | tail -n1
DISK_BEFORE="$(df -g / | tail -n1 | awk '{print $4}')"

# Idempotent apply via content markers (same spirit as apply-darkstr-patches.sh).
MARK_OK=0
if grep -Fq 'duppel-ffi = { path = "../../../../third_party/darkstr/duppel-ffi" }' \
     "${DARKSTR_GECKO_ROOT}/toolkit/library/rust/shared/Cargo.toml" \
  && grep -Fq 'extern crate duppel_ffi;' \
     "${DARKSTR_GECKO_ROOT}/toolkit/library/rust/shared/lib.rs" \
  && grep -Fq 'darkstr_ffi_abi_version' \
     "${DARKSTR_GECKO_ROOT}/toolkit/library/libxul.symbols" \
  && grep -Fq '0040: Prefer A' \
     "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" \
  && grep -Fq 'name = "duppel-ffi"' \
     "${DARKSTR_GECKO_ROOT}/Cargo.lock"; then
  MARK_OK=1
fi

if [[ "${MARK_OK}" -eq 1 ]]; then
  echo "0040 markers present — skip patch apply"
else
  echo "Applying 0040..."
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
fi

# Prerequisite crates from 0008
test -d "${DARKSTR_GECKO_ROOT}/third_party/darkstr/duppel-ffi"
test -d "${DARKSTR_GECKO_ROOT}/third_party/darkstr/duppel-persona"

OBJDIR="${DARKSTR_GECKO_OBJDIR:-}"
if [[ -z "${OBJDIR}" ]]; then
  OBJDIR="$(ls -d "${DARKSTR_GECKO_ROOT}"/obj-* 2>/dev/null | head -n1 || true)"
fi
: "${OBJDIR:?no objdir — set DARKSTR_GECKO_OBJDIR or build once}"

cd "${DARKSTR_GECKO_ROOT}"
echo "Building toolkit/library --allow-subdirectory-build (gkrust + XUL link) in ${OBJDIR}"
START="$(date +%s)"
# Incremental: rust staticlib then libxul relink. Full ./mach build only if this fails.
./mach build --allow-subdirectory-build toolkit/library
BUILD_EXIT=$?
END="$(date +%s)"
echo "mach build --allow-subdirectory-build toolkit/library EXIT=${BUILD_EXIT} elapsed_sec=$((END-START))"

XUL="${OBJDIR}/dist/bin/XUL"
if [[ ! -f "${XUL}" ]]; then
  # Non-Darwin fallback
  XUL="$(ls "${OBJDIR}/dist/bin"/libxul.* 2>/dev/null | head -n1 || true)"
fi

echo "## symbol smoke"
if [[ -n "${XUL}" && -f "${XUL}" ]]; then
  ls -lh "${XUL}"
  nm -gU "${XUL}" 2>/dev/null | grep darkstr_ffi_ || nm -g "${XUL}" 2>/dev/null | grep darkstr_ffi_ || {
    echo "WARN: darkstr_ffi_* not found as global exports on ${XUL}" >&2
  }
else
  echo "WARN: XUL/libxul artifact missing under ${OBJDIR}/dist/bin" >&2
fi

echo "disk after:"; df -h / | tail -n1
DISK_AFTER="$(df -g / | tail -n1 | awk '{print $4}')"
echo "disk_gi_free before=${DISK_BEFORE} after=${DISK_AFTER}"
echo "M-FFI-0040-MINI-APPLY: EXIT=${BUILD_EXIT}"
exit "${BUILD_EXIT}"
