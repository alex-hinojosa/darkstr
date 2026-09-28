#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# M-FFI-0041 — retire Approach B cdylib/ctypes runtime load (chrome JS only).
# Brand: darkstr — not official LibreWolf.
# Does NOT merge. Does NOT flip nativePersonaHooks. Does NOT relink XUL/gkrust.
# Does NOT package DMG. Does NOT ping Proof.
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"

if [[ -f "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
fi
: "${DARKSTR_GECKO_ROOT:?set DARKSTR_GECKO_ROOT}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="${REPO}/patches/0041-darkstr-ffi-retire-approach-b.patch"
SOT="${REPO}/patches/0041-files/DarkstrFfi.sys.mjs"
COMP="${DARKSTR_GECKO_ROOT}/browser/components"
TARGET="${COMP}/DarkstrFfi.sys.mjs"
PERSONA="${COMP}/DarkstrNativePersona.sys.mjs"

test -f "${PATCH}"
test -f "${SOT}"
test -f "${TARGET}"
test -f "${PERSONA}"

echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
echo "disk:"; df -h / | tail -n1 || true

MARK_OK=0
if grep -Fq '0041: Retire B' "${TARGET}" \
  && ! grep -Fq 'cdylibCandidates' "${TARGET}" \
  && ! grep -Fq 'kind: "cdylib"' "${TARGET}" \
  && grep -Fq 'Approach B cdylib runtime load retired (0041)' "${PERSONA}"; then
  MARK_OK=1
fi

if [[ "${MARK_OK}" -eq 1 ]]; then
  echo "0041 markers present — skip apply"
else
  echo "Applying 0041 SoT → DarkstrFfi.sys.mjs"
  cp "${SOT}" "${TARGET}"
  if ! grep -Fq 'Approach B cdylib runtime load retired (0041)' "${PERSONA}"; then
    echo "Applying 0041 patch (NativePersona honesty + any remaining DarkstrFfi hunks)..."
    # --forward: ignore already-applied DarkstrFfi hunks after SoT; still apply persona
    set +e
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${PATCH}"
    patch_rc=$?
    set -e
    if [[ "${patch_rc}" -ne 0 ]] \
      && ! grep -Fq 'Approach B cdylib runtime load retired (0041)' "${PERSONA}"; then
      echo "ERROR: NativePersona 0041 honesty comment not landed" >&2
      exit 1
    fi
  fi
fi

grep -Fq '0041: Retire B' "${TARGET}"
! grep -Fq 'cdylibCandidates' "${TARGET}"
! grep -Fq 'kind: "cdylib"' "${TARGET}"
grep -Fq 'Approach A (only runtime path)' "${TARGET}"
grep -Fq 'Approach B cdylib runtime load retired (0041)' "${PERSONA}"
grep -Fq 'prefer Rust FFI SoT (A/libxul)' "${PERSONA}"

cd "${DARKSTR_GECKO_ROOT}"
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_MACH_SITE=1
export MACH_SYSTEM_ASSERTED_COMPATIBLE_WITH_BUILD_SITE=1
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=system
PATH="/usr/bin:${PATH}" ./mach build --allow-subdirectory-build browser/components
BUILD_EXIT=$?

OBJDIR="${DARKSTR_GECKO_OBJDIR:-}"
if [[ -z "${OBJDIR}" ]]; then
  OBJDIR="$(ls -d "${DARKSTR_GECKO_ROOT}"/obj-* 2>/dev/null | head -n1 || true)"
fi
: "${OBJDIR:?no objdir}"

rm -f "${OBJDIR}/install_dist_bin.track"
( cd "${OBJDIR}" && make install-dist_bin )

APP_DIR="${OBJDIR}/dist/LibreWolf.app/Contents/Resources/moz-src/browser/components"
BIN_DIR="${OBJDIR}/dist/bin/moz-src/browser/components"
mkdir -p "${APP_DIR}" "${BIN_DIR}"
for mod in DarkstrFfi.sys.mjs DarkstrNativePersona.sys.mjs; do
  ln -sfn "${COMP}/${mod}" "${APP_DIR}/${mod}"
  ln -sfn "${COMP}/${mod}" "${BIN_DIR}/${mod}"
done

echo "## A symbol smoke (must still be present — 0041 does not touch XUL)"
XUL="${OBJDIR}/dist/bin/XUL"
if [[ -f "${XUL}" ]]; then
  nm -gU "${XUL}" 2>/dev/null | grep darkstr_ffi_ || nm -g "${XUL}" 2>/dev/null | grep darkstr_ffi_ || {
    echo "WARN: darkstr_ffi_* missing on XUL — Approach A not armed" >&2
  }
else
  echo "WARN: XUL missing under ${OBJDIR}/dist/bin" >&2
fi

echo "## B path dead checks"
! grep -Fq 'cdylibCandidates' "${TARGET}"
! grep -Fq 'kind: "cdylib"' "${TARGET}"
grep -Fq '0041: Retire B' "${TARGET}"
ls -la "${OBJDIR}/dist/bin/libduppel_ffi.dylib" 2>/dev/null || echo "(no libduppel_ffi.dylib — OK; historical inert if present)"

echo "## PHASE-4 install gate"
bash "${REPO}/docs/PHASE-4-FFI-MINI-INSTALL.sh" | head -n 8

echo "M-FFI-0041-MINI-APPLY: EXIT=${BUILD_EXIT}"
exit "${BUILD_EXIT}"
