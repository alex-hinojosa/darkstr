# Seed ↔ HTTP/JS coherence (Phase 2 exit)

## SoT

| Layer | Role |
|-------|------|
| `duppel-persona::generate_persona` | **Rust SoT** for correlated snapshot fields |
| `darkstr.persona.snapshot` JSON | What chrome `DarkstrNativePersona` prefers when hooks apply |
| `darkstr.persona.seed` fallback | Thinner chrome-only RNG path in `0003` — **not** Proof-SoT |
| Gecko Rust FFI | **Boundary crate** `duppel-ffi` (C ABI) — live Gecko link **not claimed** |

## Why seed-only can drift

Chrome `_generateFromSeed` uses fewer UA/GPU/screen picks and different `CORES` / `MEMORY` / `LANGUAGES` tables than Rust. Same numeric seed ⇒ **different** UA/hw/lang is expected until a dedicated parity patch.

## Operator XOR

```bash
cd crates
cargo run -p duppel-persona --example print_persona_snapshot -- 42 macos
# Paste JSON into about:config → darkstr.persona.snapshot
```

Goldens: [`../fixtures/seed-goldens.json`](../fixtures/seed-goldens.json).

## Automated gates

- `cargo test -p duppel-coherence seed_goldens`
- `npm test` → `tests/seed-coherence-goldens.test.mjs`
- Pollution FPP kill remains applicator / ModeXor SoT — **do not** `defaultPref(privacy.fingerprintingProtection, false)` in `darkstr.cfg` (breaks Homogeneous stock FPP).

## Phase 4 — sticky per-eTLD+1 seed (0030)

Under Pollution+`darkstr.nativePersonaHooks`, chrome `DarkstrNativePersona` maps
**eTLD+1 → u32 seed** for the browser session (`Services.eTLD` / base domain from
the top browsing-context URI). Same site (incl. two tabs) shares one seed;
different sites get different seeds; the seed never remaps mid-site.

| Pref | Role |
|------|------|
| `darkstr.persona.rotatePerSite` | Default **true**. Master switch for per-site remap. |
| `darkstr.persona.snapshot` non-empty | **Lock** — no remap; pasted Rust golden as today. |
| `darkstr.persona.rotatePerSite=false` | **Lock** — global `darkstr.persona.seed` / snapshot path (Proof seed-42). |
| `darkstr.persona.lastEtld` / `effectiveSeed` | Diagnostics for Proof XOR. |

Homogeneous / hooks off: idle (no rotation effects). Correlated snapshot still
comes from Rust FFI when present, else the JS mulberry seed path; TZ/HW/UA/langs
mirrors follow the effective seed for the current site.

