# duppel-persona

**Status:** Phase 2 M3 control-plane API (hook-site gating; no Gecko FFI).

Rust source of truth for darkstr **Pollution** personas: families, seed/rotation, coherence checks, and mode/pref side-effect helpers.

## API surface

- `PersonaSeed` / `PersonaSnapshot` / `generate_persona` (mulberry32; Firefox × host OS families)
- `Mode`, `resolve_activation`, `mode_pref_effects` (Pollution kills RFP/FPP; Homogeneous restores stock RFP)
- `prefs::*` — chrome / about:config names matching Phase 1 Proof pin
- M3: `DocShellNavPhase`, `NativePersonaPlan`, `ClientHintsPolicy::Remove`,
  `cached_snapshot_readable`, `webext_main_inject_policy` (`darkstr.nativePersonaHooks`)

## Boundaries

| In scope | Out of scope |
|----------|--------------|
| Persona structs + seeded RNG | Full browser / Gecko rewrite |
| Family filters (Firefox + host OS) | Homogeneous/RFP metric customization |
| Validators feeding `duppel-coherence` | Cloudflare / anti-detect claims |
| Pref name constants + XOR activation | Servo / Ladybird (Track D only) |

## Prefs

- `darkstr.mode` — XOR `homogeneous` \| `pollution`
- `darkstr.nativeCompatible` — global escape (independent of mode)
- Site map / strict-first-doc — still mostly WebExt until DocShell hooks land

When mode ≠ pollution, or native-compatible is on, this crate must not emit a spoof persona (`generate_persona_if_active`).

## Build

```bash
cd crates && cargo test -p duppel-persona
```

GPL-3.0-only. Not official LibreWolf.
