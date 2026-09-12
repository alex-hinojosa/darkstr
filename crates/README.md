# darkstr Rust workspace (Phase 2 control plane)

Control-plane crates for the **private LibreWolf-based fork**. Not a Gecko rewrite. Servo / Ladybird remain research-only Track D.

| Crate | Role | Status |
|-------|------|--------|
| [`duppel-persona`](duppel-persona/) | Persona families, seed/rotation, validators, mode/pref helpers | **M0.5 API** (no Gecko FFI) |
| [`duppel-chaff`](duppel-chaff/) | Quiet/Balanced/Loud schedules + metrics | **M0.5 API** (no native net) |
| [`duppel-coherence`](duppel-coherence/) | HTTP↔JS assertions + XOR matrix for Proof | **M0.5 API** |
| [`duppel-bridge`](duppel-bridge/) | Prefs applicator trait + hook-site enums for future XPCOM glue | **Gecko-hooks sketch** (no FFI) |

Plan: [`../docs/PHASE-2-PLAN.md`](../docs/PHASE-2-PLAN.md). Bridge: [`../docs/PREF-BRIDGE.md`](../docs/PREF-BRIDGE.md). Hooks: [`../docs/GECKO-HOOKS.md`](../docs/GECKO-HOOKS.md). XOR gates: [`../docs/PROOF-XOR-CHECKLIST.md`](../docs/PROOF-XOR-CHECKLIST.md). Patch stubs: [`../patches/`](../patches/).

Chrome pref names (stable): `darkstr.mode`, `darkstr.nativeCompatible` — see `duppel_persona::prefs`.

```bash
cd crates && cargo test
```

GPL-3.0-only. Brand **darkstr** — not official LibreWolf.
