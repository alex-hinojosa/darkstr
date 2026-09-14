#!/usr/bin/env bash
# apply-darkstr-patches.sh — M1-safe apply order for a LibreWolf-based darkstr tree.
#
# M1 skim (no bootstrap/build): verify tree, install darkstr.cfg under lw/,
# optionally append defaultPref block into lw/librewolf.cfg (idempotent).
#
# Safe outside a fork: exits 0 with a message if DARKSTR_GECKO_ROOT is unset
# (unless --require-root). Does NOT vendor Mozilla/LibreWolf.
# Brand: darkstr — not official LibreWolf.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUBS="${ROOT}/patches/stubs"
CFG_SRC="${STUBS}/darkstr.cfg"

REQUIRE_ROOT=0
DRY_RUN=0
APPEND_LW=1
ENV_FILE_DEFAULT=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

Options:
  --require-root     Exit 1 if DARKSTR_GECKO_ROOT is unset/missing
  --dry-run          Print actions only
  --no-append-lw     Only copy darkstr.cfg; do not touch librewolf.cfg
  --env-file PATH    Source DARKSTR_GECKO_ROOT from this file if unset
  -h, --help         Show help

Env:
  DARKSTR_GECKO_ROOT   Path to clean LibreWolf/Firefox tree (client.mk + browser/ + lw/)
  DARKSTR_CFG_DEST     Override cfg install path (default: \$ROOT/lw/darkstr.cfg)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-root) REQUIRE_ROOT=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-append-lw) APPEND_LW=0; shift ;;
    --env-file) ENV_FILE_DEFAULT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# Prefer Mini SSD env file when present and root unset.
if [[ -z "${DARKSTR_GECKO_ROOT:-}" ]]; then
  for candidate in \
      "${ENV_FILE_DEFAULT}" \
      "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env" \
      "/Users/alexander/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"; do
    if [[ -n "${candidate}" && -f "${candidate}" ]]; then
      # shellcheck disable=SC1090
      # Only export DARKSTR_GECKO_ROOT from the env file.
      # Avoid sourcing arbitrary shell.
      root_line="$(grep -E '^[[:space:]]*export[[:space:]]+DARKSTR_GECKO_ROOT=' "${candidate}" | tail -n1 || true)"
      if [[ -z "${root_line}" ]]; then
        root_line="$(grep -E '^[[:space:]]*DARKSTR_GECKO_ROOT=' "${candidate}" | tail -n1 || true)"
      fi
      if [[ -n "${root_line}" ]]; then
        eval "${root_line}"
        export DARKSTR_GECKO_ROOT
        echo "apply-darkstr-patches: loaded DARKSTR_GECKO_ROOT from ${candidate}"
      fi
      break
    fi
  done
fi

if [[ -z "${DARKSTR_GECKO_ROOT:-}" ]]; then
  echo "apply-darkstr-patches: DARKSTR_GECKO_ROOT unset — no Gecko tree to patch."
  echo "  Export DARKSTR_GECKO_ROOT=/path/to/librewolf-based-tree when M1 fork exists."
  echo "  Stub cfg available at: ${CFG_SRC}"
  if [[ "${REQUIRE_ROOT}" -eq 1 ]]; then
    exit 1
  fi
  exit 0
fi

if [[ ! -d "${DARKSTR_GECKO_ROOT}" ]]; then
  echo "apply-darkstr-patches: DARKSTR_GECKO_ROOT is not a directory: ${DARKSTR_GECKO_ROOT}" >&2
  exit 1
fi

# Tree sanity (M1 skim).
missing=0
for need in client.mk browser lw; do
  if [[ ! -e "${DARKSTR_GECKO_ROOT}/${need}" ]]; then
    echo "apply-darkstr-patches: missing ${need} under ${DARKSTR_GECKO_ROOT}" >&2
    missing=1
  fi
done
if [[ ! -f "${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg" ]]; then
  echo "apply-darkstr-patches: missing lw/librewolf.cfg (LibreWolf baseline)" >&2
  missing=1
fi
if [[ "${missing}" -ne 0 ]]; then
  exit 1
fi

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "DRY-RUN: $*"
  else
    eval "$@"
  fi
}

# Product cfg destination — LibreWolf ships under lw/; keep darkstr beside it.
CFG_DEST="${DARKSTR_CFG_DEST:-${DARKSTR_GECKO_ROOT}/lw/darkstr.cfg}"
echo "Installing darkstr.cfg defaults -> ${CFG_DEST}"
run "cp \"${CFG_SRC}\" \"${CFG_DEST}\""

MARKER_BEGIN="// BEGIN darkstr-m1-prefs"
MARKER_END="// END darkstr-m1-prefs"
LW_CFG="${DARKSTR_GECKO_ROOT}/lw/librewolf.cfg"

if [[ "${APPEND_LW}" -eq 1 ]]; then
  if grep -Fq "${MARKER_BEGIN}" "${LW_CFG}" 2>/dev/null; then
    echo "lw/librewolf.cfg already contains darkstr-m1-prefs block — skip append."
  else
    echo "Appending darkstr defaultPref block to ${LW_CFG}"
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      echo "DRY-RUN: append markers + defaultPref(darkstr.*) to lw/librewolf.cfg"
    else
      {
        echo ""
        echo "${MARKER_BEGIN}"
        echo "// darkstr M1 prefs — layered on LibreWolf baseline; do not customize RFP metrics."
        echo "// Brand: darkstr — not official LibreWolf. Full file also at lw/darkstr.cfg."
        echo 'defaultPref("darkstr.mode", "homogeneous");'
        echo 'defaultPref("darkstr.nativeCompatible", false);'
        echo 'defaultPref("darkstr.strictFirstDoc", true);'
        echo "${MARKER_END}"
      } >> "${LW_CFG}"
    fi
  fi
else
  echo "Skipping librewolf.cfg append (--no-append-lw). Remember: a lone darkstr.cfg is not loaded unless autoconfig points at it."
fi

# Real unified diffs will drop the .stub suffix. Apply in order when present.
shopt -s nullglob
for patch in "${STUBS}"/000*.patch "${ROOT}/patches"/000*.patch; do
  [[ -f "${patch}" ]] || continue
  echo "Applying ${patch}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "DRY-RUN: patch -d ${DARKSTR_GECKO_ROOT} -p1 < ${patch}"
  else
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 < "${patch}"
  fi
done

stub_count=0
for stub in "${STUBS}"/000*.patch.stub; do
  stub_count=$((stub_count + 1))
done
if [[ "${stub_count}" -gt 0 ]]; then
  echo "Note: ${stub_count} .patch.stub file(s) present — sketches only, not applied."
  echo "Remaining stubs are sketches; real M2 observer is patches/0002-darkstr-mode-xor-rfp.patch when present."
fi

echo "Done. Cfg path always; real unified diffs under patches/000*.patch applied when present."
echo "Remember XOR: Pollution kills RFP/FPP; Homogeneous restores stock RFP (no metric customization)."
echo "M2 live observer: patches/0002-darkstr-mode-xor-rfp.patch (DarkstrModeXor.sys.mjs). Rebuild: ./mach build browser/components (see docs/M2-STATUS.md)."
