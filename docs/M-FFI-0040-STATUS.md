# M-FFI-0040 status — Approach A (gkrust path-dep → libxul)

**Brand:** darkstr — not official LibreWolf.  
**Train:** LibreWolf / Firefox **156.0.1-1**.  
**Patch:** [`../patches/0040-darkstr-ffi-gkrust-libxul.patch`](../patches/0040-darkstr-ffi-gkrust-libxul.patch)  
**PR:** [#71](https://github.com/alex-hinojosa/darkstr/pull/71) **MERGED** as `f828a78d255aa3fad61c062ffd44912cd7e0b5c9`  
**Tip at Proof:** `73e7e4fcb5e7d630e4e20b71f3165ea63b3426f9`  
**Branch:** `builder/m-ffi-approach-a-libxul` (does **not** touch PR #70 / FontFaceSet 0039).  
**Proof:** **PASS** — evidence `~/AgentDocs/proof/darkstr-pr71-0040-xor-20260928-074243/` + [PR comment](https://github.com/alex-hinojosa/darkstr/pull/71#issuecomment-5870086745).

## Approach

| Option | Choice | Why |
|--------|--------|-----|
| **A** gkrust path-dep (`toolkit/library/rust/shared` + `extern crate` → libxul/XUL) | **Selected / Proof-green on main** | Rust persona ABI symbols live in libxul; chrome Prefer A via ctypes on XUL |
| **B** release `cdylib` + chrome ctypes | **Fallback retained** | Prefer A then B; B load path **not** deleted in #71 merge; retirement is open follow-up |

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
| Mini gkrust + XUL link + `nm` on XUL | **Yes** (Builder + Proof) |
| Proof XOR PASS / merge on main | **Yes** — PR #71 MERGED `f828a78` |
| Headed Prefer A (`loadSource=libxul`) | **Optional / soft-OK** (not executed; A symbols + Prefer A order verified) |
| Approach B retirement (delete cdylib load path) | **No** — B retained; open follow-up |
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

## Proof XOR checklist — **PASS** (2026-09-28 ~07:45 CDT)

- [x] `0040` apply idempotent (markers skip on 2nd run)
- [x] Mini: `./mach build --allow-subdirectory-build toolkit/library` EXIT 0
- [x] Mini: `nm -gU …/XUL` shows three `darkstr_ffi_*` globals
- [x] Optional headed Prefer A — **soft-OK / skipped** (A symbols in XUL + Prefer A stage order verified)
- [x] Soft-fail closed still OK when A not armed; B cdylib fallback retained
- [x] STATUS honesty: A Proof-green; Prefer A then B; B load path retained; hooks default-off; no PM copy

## Soft residuals / B retirement plan

1. **Prefer A then B** on main: chrome tries in-process XUL/libxul first, then Approach B cdylib.
2. **B load path retained** in this merge — do **not** delete `build-and-install-ffi.sh` / PHASE-4 install / cdylib ctypes path yet.
3. **B retirement** remains an **open follow-up** (optional keep as emergency ctypes path).
4. `nativePersonaHooks` remains **default-off**.
5. Disk: full XUL link is heavy — Builder recorded ~21→16 Gi during Mini LTO/link.


## Mini verify (Builder — 2026-09-28 CDT)

| Step | Result |
|------|--------|
| Disk before | **~21 Gi free** (`df -h /`) |
| Apply 0040 sources on tree | **Applied** (Cargo.toml / lib.rs / libxul.symbols / DarkstrFfi / Cargo.lock) |
| `cargo update -p gkrust-shared --offline` | **EXIT 0** — locked path-only `duppel-ffi` + `duppel-persona` (no crates.io) |
| `./mach build toolkit/library` (no flag) | No-op (subdirectory ignored) |
| `./mach build --allow-subdirectory-build toolkit/library` | **SUCCESS** — wall ~846s (~14m); gkrust LTO + XUL relink |
| `nm -gU obj-*/dist/bin/XUL \| grep darkstr_ffi_` | **`_darkstr_ffi_abi_version`**, **`_darkstr_ffi_persona_snapshot_json`**, **`_darkstr_ffi_string_free`** (global T) |
| Generated `XUL.symbols` | Includes three `_darkstr_ffi_*` exports |
| `DarkstrFfi.sys.mjs` in dist | Symlink → source with Prefer A (`0040: Prefer A`) |
| Python `ctypes.CDLL(XUL)` outside browser | Soft-fail (missing `@rpath` NSS) — **nm export smoke is the A gate**; chrome loads XUL in-process |
| Disk after | **~16 Gi free** (~5 Gi consumed during LTO/link; watch before full package) |
| `nativePersonaHooks` default | **Still false** |
| Headed Prefer A (optional) | **Soft-OK / skipped** |
| Proof XOR / merge | **PASS** / PR #71 MERGED `f828a78` |

**Soft:** rust-objcopy strip warning (`libLLVM.dylib` missing on rustup) — non-fatal. Approach B cdylib remains installed as fallback.

## Proof result — PASS

All required 0040 XOR gates passed on Proof tip `73e7e4fcb5e7d630e4e20b71f3165ea63b3426f9` (2026-09-28 ~07:42–07:45 CDT).

| Item | Value |
|------|-------|
| PR | [#71](https://github.com/alex-hinojosa/darkstr/pull/71) **MERGED** as `f828a78d255aa3fad61c062ffd44912cd7e0b5c9` |
| Tip at Proof | `73e7e4fcb5e7d630e4e20b71f3165ea63b3426f9` |
| Evidence | `~/AgentDocs/proof/darkstr-pr71-0040-xor-20260928-074243/` |
| PR comment | https://github.com/alex-hinojosa/darkstr/pull/71#issuecomment-5870086745 |
| Prefer | **A then B** |
| B retirement | **Open follow-up** — load path retained |
| Hooks default | **Still false** |

**Soft residuals (not FAIL):** optional headed Prefer A not executed; rust-objcopy strip warning non-fatal; B cdylib still installed as fallback.
