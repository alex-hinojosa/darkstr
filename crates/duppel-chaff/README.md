# duppel-chaff

**Status:** Phase 2 M4 control-plane API (no native network scheduler / no Gecko FFI).

Rust source of truth for darkstr **chaff / poison** schedules: Quiet / Balanced / Loud intervals, batch sizes, stagger timing, endpoint templates, and pollution metrics.

## API surface (M4)

- `ChaosLevel`, `ChaffSchedule`, `IntervalRangeMinutes`, `BatchSizeRange`, `StaggerMs` (Phase 1 `poisoner.js` parity)
- `ChaffSchedulerPlan` / `scheduler_armed` — gate on `pollution_active` / `allow_chaff` (bridge: `allow_persona_chaff`)
- `plan_batch` / `plan_fire` / `ChaffFirePlan` — volume + timing when armed
- `PollutionMetrics` — batches, beacons, arms/cancels
- `ENDPOINT_TEMPLATES` — catalog only; no I/O
- Pref pin: `darkstr.chaosLevel` (`CHAOS_LEVEL_PREF`)

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Schedulers (Quiet / Balanced / Loud) | Tracker blocklist (LibreWolf uBO) |
| Beacon endpoint templates | TLS / JA3 spoof marketing |
| Metrics counters | “Beats Cloudflare” claims |
| Native scheduler **plan** behind prefs | Live Gecko timer / channel fire (private fork) |

## Prefs / gating

Runs only when Pollution is active (`darkstr.mode = pollution`), RFP is off (fork auto-kill), and Native-Compatible is not escaping.

Phase 1 keeps `bridge.js` + `poisoner.js` until this crate is wired into the fork.

## Build

```bash
cd crates && cargo test -p duppel-chaff
```

GPL-3.0-only. Not official LibreWolf.
