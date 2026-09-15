# Phase 2 M-FFI status — Gecko FFI boundary (first pin)

**Brand:** darkstr — not official LibreWolf.  
**Train target (later live patch):** LibreWolf / Firefox **155.0.1-1**.

## Goal

Introduce a **reviewed** Rust→C ABI boundary so Pollution HTTP+JS can eventually consume `duppel-persona` without hand-pasted snapshot JSON — without claiming live Gecko linkage in this PR.

## What this pin ships

| Item | Status |
|------|--------|
| `crates/duppel-ffi` (`rlib` + `staticlib` + `cdylib`) | **New** |
| C ABI: `darkstr_ffi_abi_version`, `darkstr_ffi_persona_snapshot_json`, `darkstr_ffi_string_free` | **New** |
| `darkstr_ffi.h` | **New** |
| `patches/stubs/0008-darkstr-gecko-ffi-link.stub` | Sketch only |
| Live `moz.build` / `mach` link on Mini | **Not claimed** |
| Chrome/C++ calling the ABI | **Not claimed** |
| `unsafe` outside `duppel-ffi` | **Forbidden** (other crates stay `forbid(unsafe_code)`) |

## Honesty

- Snapshot JSON matches `docs/SEED-COHERENCE.md` / `fixtures/seed-goldens.json` SoT.
- Chrome `0003` seed-only fallback remains thinner until a parity or FFI-backed refresh.
- `darkstr.nativePersonaHooks` stays **default-off**; no PM first-run copy in this PR.
- No Cloudflare / TLS / JA3 / RFP metric customization.

## Proof XOR

1. `cargo test -p duppel-ffi`
2. ABI version == 1; seed 42 macos JSON matches goldens (Firefox UA, MacIntel, Europe/Berlin).
3. STATUS / GECKO-HOOKS say **boundary crate only** — no Mini linkage claim.
4. Stub `0008` is not a real patch.

## Next (follow-up)

Train-pinned `0008` moz.build + Mini `mach` link; chrome prefers FFI snapshot over seed fallback; then Proof live XOR.
