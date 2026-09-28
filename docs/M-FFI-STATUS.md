# Phase 2 M-FFI status — Gecko FFI boundary → live link

**Brand:** darkstr — not official LibreWolf.  
**Train target:** LibreWolf / Firefox **156.0.1-1** (historical 155 pins remain in 0008 docs).

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
| Approach A (gkrust path-dep into libxul) | **0040 Proof-green on main** — PR [#71](https://github.com/alex-hinojosa/darkstr/pull/71) MERGED `f828a78`; see [`M-FFI-0040-STATUS.md`](M-FFI-0040-STATUS.md) |
| Chrome Prefer A then B | **Landed** — in-process XUL/libxul first; Approach B cdylib fallback retained |
| Mini apply + `mach` + symbol smoke EXIT recorded from authoring executor | **See M-FFI-0008-STATUS** (B) / **M-FFI-0040-STATUS** (A) |
| `darkstr.nativePersonaHooks` default | **Still false** (unchanged) |
| Approach B load-path retirement | **Open follow-up** — B retained in #71 merge |
| Headed Prefer A / PM copy | **Not claimed** (optional headed soft-OK) |

## Honesty

- Snapshot JSON matches `docs/SEED-COHERENCE.md` / `fixtures/seed-goldens.json` SoT (Rust `generate_persona`).
- Chrome **prefers Approach A** (XUL/libxul in-process) then **Approach B** (cdylib); JS mulberry `_generateFromSeed` remains last-resort fallback.
- Approach B load path is **retained**; retirement is an open follow-up (not done in #71).
- No Cloudflare / TLS / JA3 / RFP metric customization.
- Brand: darkstr — not official LibreWolf.

## Details

See [`M-FFI-0008-STATUS.md`](M-FFI-0008-STATUS.md).


## Follow-up

- **0009**: [`M-FFI-0009-STATUS.md`](M-FFI-0009-STATUS.md).
- **0040 Approach A**: [`M-FFI-0040-STATUS.md`](M-FFI-0040-STATUS.md) — **Proof PASS / MERGED** on main; Prefer A then B; B retirement still open.
