# Seed ↔ HTTP/JS coherence (Phase 2 exit)

## SoT

| Layer | Role |
|-------|------|
| `duppel-persona::generate_persona` | **Rust SoT** for correlated snapshot fields |
| `darkstr.persona.snapshot` JSON | What chrome `DarkstrNativePersona` prefers when hooks apply |
| `darkstr.persona.seed` fallback | Chrome RNG path when the native library is missing; since **0055** an exact port of `generate_persona` (goldens `fixtures/persona-goldens-0055.json`) |
| Gecko Rust FFI | **Boundary crate** `duppel-ffi` (C ABI) — live Gecko link **not claimed** |

## Why seed-only can drift

Before 0055, chrome `_generateFromSeed` used fewer UA/GPU/screen picks and different `CORES` / `MEMORY` / `LANGUAGES` tables than Rust, with no timezone. **0055 (O9)** made it an exact port (same tables, same mulberry32 draw order, timezone included), so a seed gives the same persona with or without the native library.

**Version (0055, N6):** no UA literals. Rust builds every UA from Gecko's `config/milestone.txt` (`build.rs`; CI fallback `crates/duppel-persona/gecko-milestone.txt`), and chrome builds it from `Services.appinfo.version`. `fixtures/seed-goldens.json` was regenerated for 156: only `userAgent` changed, hardware / languages / timezone per seed are unchanged.

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

## Phase 4 — sticky per-eTLD+1 seed (0030) — **MERGED** / Proof XOR **PASS**

**Status:** PR [#60](https://github.com/alex-hinojosa/darkstr/pull/60) merged (`b5e4db7`); Proof PASS on LibreWolf 156 tip `95089c0`. Evidence: `~/src/darkstr-gecko/proof-xor/pr60-etld-0030-PASS.md`.

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

## Phase 4 — audio silence-safe farbling (0031) — **MERGED** / Proof XOR **PASS**

Depth `audioSeed` (from persona snapshot / mulberry fallback, and after 0030 the
**eTLD+1-effective** snapshot via `resolveSnapshotForBrowsingContext` / `resolveSnapshotForUri`) drives a
Brave-style multiplicative fudge on AudioBuffer + AnalyserNode readouts. Exact
silence stays silence (`0 * fudge == 0`); no mid-site random noise. Proof may
lock golden seed-42 via snapshot or `rotatePerSite=false` as with 0030.

## Phase 4 — WebGL extension list + shader precision (0032) — **MERGED** / Proof XOR **PASS**

Depth `canvasSeed` (persona snapshot / mulberry fallback; after 0030 the
**eTLD+1-effective** snapshot) drives:

- `getSupportedExtensions` / `getExtension` — Firefox-plausible baseline
  intersected with native (plus stubs for `WEBGL_debug_renderer_info` /
  `EXT_texture_filter_anisotropic`); optional extensions keep/drop by
  deterministic seed hash (Brave-like, not random noise).
- `getShaderPrecisionFormat` — seed picks one of two coherent Firefox-desktop
  precision profiles (no impossible mantissa/range).

Same seed → stable digests (WeakMap double-read). Different eTLD+1 → diverge.
Golden lock via snapshot or `rotatePerSite=false` as with 0030. Independent of
0031 audio farbling (different DepthHooksChild region).

## Soft residual — depth lastSeeds eTLD diag (0034)

`darkstr.depth.lastSeeds` is written from the same effective seed path as content
install (`DarkstrDepthHooks.depthSeedsForBrowsingContext`):

| Mode | lastSeeds source |
|------|------------------|
| `rotatePerSite` on | eTLD-derived via `_seedForEtld` → `_generateDepthFromSeed` (or snapshot depth fields) |
| Golden lock (snapshot non-empty **or** `rotatePerSite=false`) | global / plan seeds |

Verify: two eTLD+1 under Pollution+rotate → different `canvasSeed`/`audioSeed` in
`lastSeeds` (aligned with digests). Diagnostic only — no farbling math change.

## Phase 5 — fonts coherence (0036) — **MERGED / PASS**

Depth `fontSeed` is derived in `_generateDepthFromSeed` **after** `canvasSeed` and
`audioSeed` so prior golden digests stay bit-identical. Snapshot may supply
`fontSeed` / `font_seed`; otherwise chrome uses a stable XOR fallback that does
**not** advance the mulberry stream. Under 0030 `rotatePerSite`,
`depthSeedsForBrowsingContext` re-derives `fontSeed` with the eTLD-effective seed;
golden lock (snapshot / `rotatePerSite=false`) keeps global plan seeds.

`darkstr.depth.lastSeeds` includes `fontSeed` alongside canvas/audio/gpu (0034 path).
Farbling math lives in `DarkstrDepthHooksChild` (measureText / fonts.check / DOM
widths) — Proof XOR gates in `PHASE-5-STATUS.md`.

## Phase 5 — speech coherence (0037) — **MERGED / PASS**

Depth `speechSeed` is derived in `_generateDepthFromSeed` **after** `fontSeed`
so prior goldens stay intact. Snapshot may supply `speechSeed` / `speech_seed`;
otherwise chrome uses a stable XOR fallback (`fontSeed`⊕`canvasSeed`) that does
not consume the mulberry stream. Under 0030 `rotatePerSite`,
`depthSeedsForBrowsingContext` re-derives `speechSeed` with the eTLD-effective seed;
golden lock keeps snapshot/global plan seeds.

`darkstr.depth.lastSeeds` includes `speechSeed`. Farbling lives in
`DarkstrDepthHooksChild` (`speechSynthesis.getVoices` subset/reorder of host
voices; SpeechRecognition lang soft when ctor exposed).

## Phase 5 — WebGPU coherence (0038) — **MERGED / PASS**

Depth `webgpuSeed` is derived in `_generateDepthFromSeed` **after** `speechSeed`
so prior goldens stay intact. Snapshot may supply `webgpuSeed` / `webgpu_seed`;
otherwise chrome uses a stable XOR fallback (`speechSeed`⊕`audioSeed`) that does
not consume the mulberry stream. Under 0030 `rotatePerSite`,
`depthSeedsForBrowsingContext` re-derives `webgpuSeed` with the eTLD-effective seed
**first** (not snap-canvas fallthrough to global plan.seeds); golden lock keeps
snapshot/global plan seeds.

`darkstr.depth.lastSeeds` includes `webgpuSeed`. Farbling lives in
`DarkstrDepthHooksChild` (window `navigator.gpu.requestAdapter` → Proxy adapter/
device; seed-ranked features subset; soft `max*` limits; AdapterInfo mapped from depth `gpu`
persona; `requestDevice` reuses adapter farbled features/limits/info via
`sharedFeatCache` + plain AdapterInfo/limits + `defineProperty` device overlay for
adapter↔device coherence under Marionette/Xray). LibreWolf `dom.webgpu.enabled`
default **false** — hooks idle when `navigator.gpu` absent (soft-coherence; no API
invention). Soft residuals: `AdapterInfo.device` empty; Worker WebGPU out of scope;
feature subset seed-ranked drop. Proof XOR **PASS** on tip
`4eaca24c22c8b45cb909f4b777d2c89430d013dd`; PR [#69](https://github.com/alex-hinojosa/darkstr/pull/69)
merged as `b974c8077500a5e8d2ad35a22eee6135c291754b`. Evidence:
`~/AgentDocs/proof/darkstr-pr69-0038-xor-20260928-015655/`. Phase 5 eng depth backlog empty.

