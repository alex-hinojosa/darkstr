#!/usr/bin/env bash
# apply-darkstr-patches.sh — example apply order for a LibreWolf-based darkstr tree.
#
# Safe outside a fork: exits 0 with a message if DARKSTR_GECKO_ROOT is unset.
# Does NOT vendor Mozilla/LibreWolf. Brand: darkstr — not official LibreWolf.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUBS="${ROOT}/patches/stubs"
CFG_SRC="${STUBS}/darkstr.cfg"

if [[ -z "${DARKSTR_GECKO_ROOT:-}" ]]; then
  echo "apply-darkstr-patches: DARKSTR_GECKO_ROOT unset — no Gecko tree to patch."
  echo "  Export DARKSTR_GECKO_ROOT=/path/to/librewolf-based-tree when M1 fork exists."
  echo "  Stub cfg available at: ${CFG_SRC}"
  exit 0
fi

if [[ ! -d "${DARKSTR_GECKO_ROOT}" ]]; then
  echo "apply-darkstr-patches: DARKSTR_GECKO_ROOT is not a directory: ${DARKSTR_GECKO_ROOT}" >&2
  exit 1
fi

# Product cfg destination — adjust when fork layout is known (M1).
CFG_DEST="${DARKSTR_CFG_DEST:-${DARKSTR_GECKO_ROOT}/darkstr.cfg}"
echo "Installing darkstr.cfg defaults -> ${CFG_DEST}"
cp "${CFG_SRC}" "${CFG_DEST}"

# Real unified diffs will drop the .stub suffix. Apply in order when present.
shopt -s nullglob
for patch in "${STUBS}"/000*.patch; do
  echo "Applying ${patch}"
  patch -d "${DARKSTR_GECKO_ROOT}" -p1 < "${patch}"
done

stub_count=0
for stub in "${STUBS}"/000*.patch.stub; do
  stub_count=$((stub_count + 1))
done
if [[ "${stub_count}" -gt 0 ]]; then
  echo "Note: ${stub_count} .patch.stub file(s) present — sketches only, not applied."
  echo "Replace with real diffs against the pinned Firefox/LibreWolf train before CI apply."
fi

echo "Done. Remember XOR: Pollution kills RFP/FPP; Homogeneous restores stock RFP (no metric customization)."
