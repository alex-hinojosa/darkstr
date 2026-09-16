# Phase 2 M-FFI status — Gecko FFI boundary → live link

**Brand:** darkstr — not official LibreWolf.  
**Train target:** LibreWolf / Firefox **155.0.1-1**.

## Goal

Reviewed Rust→C ABI (`duppel-ffi`) consumed by Pollution chrome without hand-pasted snapshot JSON.

## What shipped

| Item | Status |
|------|--------|
| `crates/duppel-ffi` (`rlib` + `staticlib` + `cdylib`) | **Landed** (#27) |
| C ABI: `darkstr_ffi_abi_version`, `darkstr_ffi_persona_snapshot_json`, `darkstr_ffi_string_free` | **Landed** |
| `darkstr_ffi.h` | **Landed** |
| Train-pinned `patches/0008-darkstr-gecko-ffi-link.patch` (Approach **B**) | **This pin** |
| Chrome `DarkstrFfi.sys.mjs` + `_readSnapshot` prefers FFI | **This pin** |
| Approach A (gkrust path-dep into libxul) | **Deferred** (Cargo.lock) |
| Mini apply + `mach` + symbol smoke EXIT recorded from authoring executor | **See M-FFI-0008-STATUS** |
| `darkstr.nativePersonaHooks` default | **Still false** (unchanged) |
| Headed Proof XOR / PM copy | **Not claimed** |

## Honesty

- Snapshot JSON matches `docs/SEED-COHERENCE.md` / `fixtures/seed-goldens.json` SoT (Rust `generate_persona`).
- JS mulberry `_generateFromSeed` remains fallback when the cdylib is missing.
- No Cloudflare / TLS / JA3 / RFP metric customization.
- Brand: darkstr — not official LibreWolf.

## Details

See [`M-FFI-0008-STATUS.md`](M-FFI-0008-STATUS.md).


## Follow-up

- **0009**: [`M-FFI-0009-STATUS.md`](M-FFI-0009-STATUS.md).
