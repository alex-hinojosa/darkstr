# M-FFI-0040 status — Approach A (gkrust path-dep → libxul)

**Brand:** darkstr — not official LibreWolf.  
**Train:** LibreWolf / Firefox **156.0.1-1**.  
**Patch:** [`../patches/0040-darkstr-ffi-gkrust-libxul.patch`](../patches/0040-darkstr-ffi-gkrust-libxul.patch)  
**Branch:** `builder/m-ffi-approach-a-libxul` (does **not** touch PR #70 / FontFaceSet 0039).

## Approach

| Option | Choice | Why |
|--------|--------|-----|
| **A** gkrust path-dep (`toolkit/library/rust/shared` + `extern crate` → libxul/XUL) | **Selected** | Rust persona ABI symbols live in libxul; chrome Prefer A via ctypes on XUL |
| **B** release `cdylib` + chrome ctypes | **Fallback** | Remains until A is Proof-green; then prefer A / document B load-path retirement |

## What this pin changes

| Item | Change |
|------|--------|
| `toolkit/library/rust/shared/Cargo.toml` | `duppel-ffi = { path = "../../../../third_party/darkstr/duppel-ffi" }` |
| `toolkit/library/rust/shared/lib.rs` | `extern crate duppel_ffi;` (force link into gkrust → XUL) |
| `toolkit/library/libxul.symbols` | Export `darkstr_ffi_abi_version`, `darkstr_ffi_persona_snapshot_json`, `darkstr_ffi_string_free` (Darwin `dead_strip` + `exported_symbols_list` otherwise strips / hides them) |
| `Cargo.lock` | Path-only packages `duppel-ffi` + `duppel-persona` (no crates.io additions) |
| `browser/components/DarkstrFfi.sys.mjs` | Prefer in-process XUL/libxul symbols; fall back to B cdylib; `darkstr.ffi.loadSource` = `libxul` \| `cdylib` |

## Claimed / not claimed

| Item | Claimed? |
|------|----------|
| Real unified diff `0040-*.patch` | **Yes** |
| Path-dep + `extern crate` + symbols export + lock | **Yes** |
| Chrome Prefer A over B | **Yes** |
| `nativePersonaHooks` default | **Still false** |
| Mini gkrust + XUL link + `nm` on XUL | **See Mini section / Builder report** |
| Headed Proof XOR / merge-ready | **No** |
| Approach B retirement (delete cdylib load path) | **No** — document only until Proof-green A |
| Cloudflare / TLS / JA3 / RFP metrics | **No** |

## Mini apply / build

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr
./docs/M-FFI-0040-MINI-APPLY.sh
# or: patches/scripts/apply-darkstr-patches.sh --require-root
# then: ./mach build toolkit/library   # gkrust + XUL relink — watch disk
```

Symbol smoke (Darwin):

```bash
XUL="$(ls -d "$DARKSTR_GECKO_ROOT"/obj-*/dist/bin/XUL | head -1)"
nm -gU "$XUL" | grep darkstr_ffi_
# Expect: _darkstr_ffi_abi_version _darkstr_ffi_persona_snapshot_json _darkstr_ffi_string_free
```

## Proof XOR checklist (Builder → Proof; do not claim PASS here)

- [ ] `0040` apply idempotent (markers skip on 2nd run)
- [ ] Mini: `./mach build toolkit/library` EXIT 0 (or recorded incremental equivalent)
- [ ] Mini: `nm -gU …/XUL` shows three `darkstr_ffi_*` globals
- [ ] Optional headed: Pollution + hooks-on + seed 42 → `darkstr.ffi.loadSource=libxul`; snapshot matches goldens
- [ ] Soft-fail closed still OK when A not armed / symbols missing (JS mulberry fallback)
- [ ] STATUS honesty: A implemented; B fallback retained; hooks default-off; no PM copy

## Soft residuals / B retirement plan

1. Keep `third_party/darkstr/build-and-install-ffi.sh` + PHASE-4 install until Proof signs A headed.
2. After Proof-green A: prefer documenting retirement of B side-load (optional keep as emergency ctypes path).
3. Disk: full XUL link is heavy — Builder records free space before/after.
