# duppel-chaff

**Status:** Phase 2 stub (empty control-plane crate).

Rust source of truth for darkstr **chaff / poison** beacons: schedules, endpoint lists, and pollution metrics.

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Schedulers (Quiet / Balanced / Loud) | Tracker blocklist (LibreWolf uBO) |
| Beacon payload templates | TLS / JA3 spoof marketing |
| Metrics for the product dashboard | “Beats Cloudflare” claims |
| Native scheduler behind prefs | Rewriting LibreWolf networking in Rust wholesale |

## Prefs / gating

Runs only when Pollution is active (`darkstr.mode = pollution`), RFP is off (fork auto-kill), and Native-Compatible (global or per-site) is not escaping.

Phase 1 keeps `bridge.js` + `poisoner.js` until this crate is wired into the fork.

## Build

```bash
cd crates && cargo test -p duppel-chaff
```

GPL-3.0-only. Not official LibreWolf.
