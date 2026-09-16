#!/usr/bin/env bash
# apply-darkstr-patches.sh — M1-safe apply order for a LibreWolf-based darkstr tree.
#
# M1 skim (no bootstrap/build): verify tree, install darkstr.cfg under lw/,
# optionally append defaultPref block into lw/librewolf.cfg (idempotent).
#
# Patch loop is idempotent: dry-run with `patch -p1 --forward --batch`, then
# apply only when needed. Already-applied hunks → skip/success (no interactive
# prompts, no leftover .rej). Real conflicts still fail hard.
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
        echo 'defaultPref("darkstr.nativePersonaHooks", false);'
        echo "${MARKER_END}"
      } >> "${LW_CFG}"
    fi
  fi
else
  echo "Skipping librewolf.cfg append (--no-append-lw). Remember: a lone darkstr.cfg is not loaded unless autoconfig points at it."
fi

# Real unified diffs will drop the .stub suffix. Apply in order when present.
# Idempotent: --forward --batch dry-run first; skip already-applied (no .rej);
# apply only when dry-run is clean; real conflicts fail hard (no prompts).
# Later patches may rewrite shared files (BrowserGlue/moz.build), so a prior
# patch can fail dry-run after a later one landed — use content markers too.
patch_markers_present() {
  local base
  base="$(basename "$1")"
  case "${base}" in
    0002-darkstr-mode-xor-rfp.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrModeXor.sys.mjs" ]] \
        && grep -Fq "DarkstrModeXor" "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs" \
        && grep -Fq "DarkstrModeXor.sys.mjs" "${DARKSTR_GECKO_ROOT}/browser/components/moz.build"
      ;;
    0003-darkstr-native-persona-hooks.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaChild.sys.mjs" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" ]] \
        && grep -Fq "DarkstrNativePersona" "${DARKSTR_GECKO_ROOT}/browser/components/BrowserGlue.sys.mjs" \
        && grep -Fq "DarkstrNativePersona.sys.mjs" "${DARKSTR_GECKO_ROOT}/browser/components/moz.build"
      ;;
    0005-darkstr-cpp-native-hooks.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/DarkstrNsHttpHooks.cpp" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/DarkstrNsHttpHooks.h" ]] \
        && grep -Fq "DarkstrNsHttpHooks" "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/nsHttpHandler.cpp" \
        && grep -Fq "DarkstrNsHttpHooks.cpp" "${DARKSTR_GECKO_ROOT}/netwerk/protocol/http/moz.build" \
        && grep -Fq "darkstr.persona.ua" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
      ;;
    0006-darkstr-cpp-navigator-docshell.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.cpp" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/dom/base/DarkstrNavigatorHooks.h" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.cpp" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h" ]] \
        && grep -Fq "DarkstrNavigatorHooks" "${DARKSTR_GECKO_ROOT}/dom/base/Navigator.cpp" \
        && grep -Fq "DarkstrNavigatorHooks.cpp" "${DARKSTR_GECKO_ROOT}/dom/base/moz.build" \
        && grep -Fq "DarkstrDocShellHooks" "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp" \
        && grep -Fq "DarkstrDocShellHooks.cpp" "${DARKSTR_GECKO_ROOT}/docshell/base/moz.build" \
        && grep -Fq "darkstr.persona.platform" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
      ;;
    0007-darkstr-cpp-docshell-nav-sot.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.cpp" ]] \
        && [[ -f "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h" ]] \
        && grep -Fq "ShouldApplyPersona" "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h" \
        && grep -Fq "CurrentPhase" "${DARKSTR_GECKO_ROOT}/docshell/base/DarkstrDocShellHooks.h" \
        && grep -Fq "mBrowsingContext->Id()" "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp" \
        && grep -Fq "M3-CPP-DOCSHELL" "${DARKSTR_GECKO_ROOT}/docshell/base/nsDocShell.cpp" \
        && grep -Fq "Prefer C++ SoT mirror" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
      ;;
    0008-darkstr-gecko-ffi-link.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" ]] \
        && [[ -d "${DARKSTR_GECKO_ROOT}/third_party/darkstr/duppel-ffi" ]] \
        && grep -Fq "_readSnapshotFromFfi" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq "DarkstrFfi.sys.mjs" "${DARKSTR_GECKO_ROOT}/browser/components/moz.build" \
        && grep -Fq "darkstr_ffi_persona_snapshot_json" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs"
      ;;
    0009-darkstr-ffi-ctypes-softfail-fix.patch)
      [[ -f "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" ]] \
        && grep -Fq "defineESModuleGetters" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" \
        && grep -Fq "darkstr.ffi.lastError" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" \
        && grep -Fq "gNextRetryMs" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrFfi.sys.mjs" \
        && grep -Fq "FFI snapshot miss" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq "Persist so about:config" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs"
      ;;
    0010-darkstr-nav-languages-pageshow.patch)
      grep -Fq "pageshow" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq "pullAndApply" "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaChild.sys.mjs"
      ;;
    0011-darkstr-nav-languages-cache-invalidate.patch)
      grep -Fq 'darkstr.persona.languages' "${DARKSTR_GECKO_ROOT}/dom/base/nsGlobalWindowInner.cpp" \
        && grep -Fq 'persona languages mirror must invalidate' "${DARKSTR_GECKO_ROOT}/dom/base/nsGlobalWindowInner.cpp"
      ;;
    0012-darkstr-nav-languages-force-notify.patch)
      grep -Fq '_forceLanguagesMirrorNotify' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq 'Soft residual (0012)' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" \
        && grep -Fq 'DarkstrNativePersona.refreshPlan()' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs"
      ;;
    0013-darkstr-nav-languages-bc-override.patch)
      grep -Fq '_syncBrowsingContextLanguageOverride' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" \
        && grep -Fq 'Soft residual (0013)' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" \
        && grep -Fq 'languageOverride' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs"
      ;;
    0014-darkstr-nav-languages-intl-accept.patch)
      grep -Fq '_applyAcceptLanguagesForPersona' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq 'savedAcceptLanguages' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersona.sys.mjs" \
        && grep -Fq 'Soft residual (0014)' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" \
        && grep -Fq 'darkstr.persona.lastError' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs" \
        && grep -Fq 'langs[0]' "${DARKSTR_GECKO_ROOT}/browser/components/DarkstrNativePersonaParent.sys.mjs"
      ;;
    *)
      return 1
      ;;
  esac
}

shopt -s nullglob
for patchfile in "${STUBS}"/000*.patch "${STUBS}"/001*.patch "${ROOT}/patches"/000*.patch "${ROOT}/patches"/001*.patch; do
  [[ -f "${patchfile}" ]] || continue
  echo "Applying ${patchfile}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "DRY-RUN: patch -d ${DARKSTR_GECKO_ROOT} -p1 --forward --batch < ${patchfile}"
    continue
  fi
  if patch_markers_present "${patchfile}"; then
    echo "apply-darkstr-patches: markers present — skip ${patchfile}"
    continue
  fi
  set +e
  dry_out="$(patch -d "${DARKSTR_GECKO_ROOT}" -p1 --dry-run --forward --batch < "${patchfile}" 2>&1)"
  dry_rc=$?
  set -e
  if [[ "${dry_rc}" -eq 0 ]]; then
    patch -d "${DARKSTR_GECKO_ROOT}" -p1 --forward --batch < "${patchfile}"
  elif printf '%s\n' "${dry_out}" | grep -Eqi 'previously applied|Ignoring previously applied|Reversed \(or previously applied\)'; then
    echo "apply-darkstr-patches: already applied — skip ${patchfile}"
  else
    echo "apply-darkstr-patches: patch does not apply cleanly for ${patchfile}" >&2
    printf '%s\n' "${dry_out}" >&2
    exit 1
  fi
done

# 0008 Approach B: ensure FFI build script is executable when present.
if [[ -f "${DARKSTR_GECKO_ROOT}/third_party/darkstr/build-and-install-ffi.sh" ]]; then
  chmod +x "${DARKSTR_GECKO_ROOT}/third_party/darkstr/build-and-install-ffi.sh" || true
fi

stub_count=0
for stub in "${STUBS}"/000*.patch.stub; do
  stub_count=$((stub_count + 1))
done
if [[ "${stub_count}" -gt 0 ]]; then
  echo "Note: ${stub_count} .patch.stub file(s) present — sketches only, not applied."
  echo "Remaining stubs are sketches; real patches: 0002 XOR, 0003 chrome persona, 0005 C++ nsHttp, 0006/0007 C++ nav/docshell, 0008–0014 FFI/nav when present (0004 stub=chaff)."
fi

echo "Done. Cfg path always; real unified diffs under patches/000*.patch applied when present."
echo "Remember XOR: Pollution kills RFP/FPP; Homogeneous restores stock RFP (no metric customization)."
echo "M2 live observer: patches/0002-darkstr-mode-xor-rfp.patch (DarkstrModeXor.sys.mjs)."
echo "M3 native hooks: patches/0003-darkstr-native-persona-hooks.patch (DarkstrNativePersona*.sys.mjs). Rebuild: ./mach build browser/components (see docs/M3-STATUS.md)."
echo "M3-CPP nsHttp hooks: patches/0005-darkstr-cpp-native-hooks.patch (DarkstrNsHttpHooks). Rebuild: ./mach build netwerk/protocol/http (see docs/M3-CPP-STATUS.md)."
echo "M3-CPP-NAV Navigator/DocShell: patches/0006-darkstr-cpp-navigator-docshell.patch. Rebuild: ./mach build dom/base docshell/base (see docs/M3-CPP-NAV-STATUS.md)."
echo "M3 soft languages: patches/0010-darkstr-nav-languages-pageshow.patch (pageshow re-spoof). Rebuild: ./mach build --allow-subdirectory-build browser/components."
echo "M3 soft languages cache: patches/0011-darkstr-nav-languages-cache-invalidate.patch (WebIDL languages cache). Rebuild: ./mach build --allow-subdirectory-build dom/base."
echo "M3 soft languages force-notify: patches/0012-darkstr-nav-languages-force-notify.patch (pageshow GetSnapshot → langs prefchange). Rebuild: ./mach build --allow-subdirectory-build browser/components."
echo "M3 soft languages BC override: patches/0013-darkstr-nav-languages-bc-override.patch (GetSnapshot → top.languageOverride). Rebuild: ./mach build --allow-subdirectory-build browser/components."
echo "M3 soft languages intl.accept: patches/0014-darkstr-nav-languages-intl-accept.patch (intl.accept_languages + primary-tag languageOverride). Rebuild: ./mach build --allow-subdirectory-build browser/components."
echo "M-FFI-0009 ctypes soft-fail fix: patches/0009-darkstr-ffi-ctypes-softfail-fix.patch (PathUtils-less load + persist snapshot). Rebuild: ./mach build --allow-subdirectory-build browser/components."
echo "M-FFI-0008 gecko FFI link: patches/0008-darkstr-gecko-ffi-link.patch (Approach B cdylib). Build FFI: third_party/darkstr/build-and-install-ffi.sh --prefix \"\${DARKSTR_GECKO_OBJDIR:-obj-*}/dist/bin\". Rebuild chrome: ./mach build browser/components (see docs/M-FFI-0008-STATUS.md)."
