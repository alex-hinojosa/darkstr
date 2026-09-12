# duppel-coherence

**Status:** Phase 2 M0.5 control-plane API.

HTTP ↔ JS coherence harness + XOR exclusivity fixtures for Proof’s release gates.

## API surface

- `assert_http_js_coherent` — persona vs observed HTTP/JS probes
- `xor_matrix` / `assert_mode_exclusivity`
- `assert_pollution_kills_rfp` / `assert_homogeneous_stock_rfp`

See [`../../docs/PROOF-XOR-CHECKLIST.md`](../../docs/PROOF-XOR-CHECKLIST.md).

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Assertion helpers over persona snapshots | Full CreepJS reimplementation |
| Mode-exclusivity fixtures (RFP XOR Pollution) | Shipping as a user-facing feature |
| CI / Proof matrix inputs | Claiming Cloudflare / bot bypass |

Depends on `duppel-persona` for snapshot types.

## Build

```bash
cd crates && cargo test -p duppel-coherence
```

GPL-3.0-only. Not official LibreWolf.
