# duppel-coherence

**Status:** Phase 2 stub (empty control-plane crate).

HTTP ↔ JS coherence harness. Source of truth for Proof’s “no split-brain” release gate once personas move native.

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Assertion helpers over persona snapshots | Full CreepJS reimplementation |
| Mode-exclusivity fixtures (RFP XOR Pollution) | Shipping as a user-facing feature |
| CI / Proof matrix inputs | Claiming Cloudflare / bot bypass |

Depends on `duppel-persona` for the persona snapshot type (once defined).

## Build

```bash
cd crates && cargo test -p duppel-coherence
```

GPL-3.0-only. Not official LibreWolf.
