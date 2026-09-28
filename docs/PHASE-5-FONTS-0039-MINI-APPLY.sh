#!/usr/bin/env bash
# Thin wrapper — see scripts/apply-0039-fonts-enum-coherence-mini.sh
exec "$(cd "$(dirname "$0")/.." && pwd)/scripts/apply-0039-fonts-enum-coherence-mini.sh" "$@"
