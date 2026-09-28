#!/usr/bin/env bash
# Thin wrapper — see scripts/apply-0042-cookie-echo-qi-mini.sh
exec "$(cd "$(dirname "$0")/.." && pwd)/scripts/apply-0042-cookie-echo-qi-mini.sh" "$@"
