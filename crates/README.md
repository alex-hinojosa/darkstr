# darkstr Rust workspace (Phase 2 stubs)

Control-plane crates for the **private LibreWolf-based fork**. Not a Gecko rewrite. Servo / Ladybird remain research-only Track D.

| Crate | Role |
|-------|------|
| [`duppel-persona`](duppel-persona/) | Persona families, seed/rotation, validators |
| [`duppel-chaff`](duppel-chaff/) | Chaff / beacon schedules + metrics |
| [`duppel-coherence`](duppel-coherence/) | HTTP↔JS assertion harness for Proof |

Plan: [`../docs/PHASE-2-PLAN.md`](../docs/PHASE-2-PLAN.md).

```bash
cd crates && cargo test
```

GPL-3.0-only. Brand **darkstr** — not official LibreWolf.
