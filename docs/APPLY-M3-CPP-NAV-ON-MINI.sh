#!/usr/bin/env bash
# Apply 0006 on Mini SSD tree and rebuild Navigator/DocShell dirs.
# Brand: darkstr — not official LibreWolf. Atlas: never mv under /Volumes/Mesh.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${HOME}/src/darkstr-gecko/darkstr"
cd "$REPO"
git pull --ff-only origin main || true
./patches/scripts/apply-darkstr-patches.sh --require-root
cd "$DARKSTR_GECKO_ROOT"
df -h .
# Prefer foreground/long session so SIGHUP does not kill mach.
./mach build dom/base docshell/base
echo "mach EXIT=$?"
bash "${REPO}/docs/M3-CPP-NAV-MINI-VERIFY.sh"
