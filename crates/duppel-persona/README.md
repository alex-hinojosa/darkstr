# duppel-persona

**Status:** Phase 2 stub (empty control-plane crate).

Rust source of truth for darkstr **Pollution** personas: families, seed/rotation, and coherence checks before surfaces leave the process.

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Persona structs + seeded RNG | Full browser / Gecko rewrite |
| Family filters (Firefox + host OS) | Homogeneous/RFP metric customization |
| Validators feeding `duppel-coherence` | Cloudflare / anti-detect claims |
| FFI-ready API for Gecko prefs bridge | Servo / Ladybird (Track D only) |

## Prefs

Consumes chrome prefs (see `docs/PHASE-2-PLAN.md`):

- `darkstr.mode` — XOR `homogeneous` \| `pollution`
- `darkstr.nativeCompatible` — global escape (independent of mode)
- Site map / strict-first-doc — still mostly WebExt until DocShell hooks land

When mode ≠ pollution, or native-compatible is on, this crate must not emit a spoof persona.

## Build

```bash
cd crates && cargo test -p duppel-persona
```

GPL-3.0-only. Not official LibreWolf.
