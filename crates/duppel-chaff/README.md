# duppel-chaff

**Status:** Phase 2 M0.5 control-plane API (no native network scheduler).

Rust source of truth for darkstr **chaff / poison** schedules: Quiet / Balanced / Loud intervals, batch sizes, endpoint templates, and pollution metrics.

## API surface

- `ChaosLevel`, `ChaffSchedule`, `IntervalRangeMinutes`, `BatchSizeRange` (Phase 1 `poisoner.js` parity)
- `plan_batch` / `PollutionMetrics` — gated on `duppel_persona::resolve_activation`
- `ENDPOINT_TEMPLATES` — catalog only; no I/O

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Schedulers (Quiet / Balanced / Loud) | Tracker blocklist (LibreWolf uBO) |
| Beacon endpoint templates | TLS / JA3 spoof marketing |
| Metrics counters | “Beats Cloudflare” claims |
| Native scheduler behind prefs (later) | Rewriting LibreWolf networking in Rust wholesale |

## Prefs / gating

Runs only when Pollution is active (`darkstr.mode = pollution`), RFP is off (fork auto-kill), and Native-Compatible is not escaping.

Phase 1 keeps `bridge.js` + `poisoner.js` until this crate is wired into the fork.

## Build

```bash
cd crates && cargo test -p duppel-chaff
```

GPL-3.0-only. Not official LibreWolf.
