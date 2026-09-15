# M-FFI-0008 status — live Gecko FFI link (Approach B)

**Brand:** darkstr — not official LibreWolf.  
**Train:** LibreWolf / Firefox **155.0.1-1**.  
**Patch:** [`../patches/0008-darkstr-gecko-ffi-link.patch`](../patches/0008-darkstr-gecko-ffi-link.patch)

## Approach

| Option | Choice | Why |
|--------|--------|-----|
| **A** gkrust path-dep (`toolkit/library/rust/shared` + `extern crate` → libxul) | Deferred | Needs live `cargo update -p gkrust-shared` on train `Cargo.lock`; Mini local-exec was unavailable to the authoring executor for lock iteration |
| **B** release `cdylib` + chrome ctypes (`DarkstrFfi.sys.mjs`) | **Selected** | Symbols reachable from shipped `libduppel_ffi` next to the binary; chrome actually calls ABI; no Gecko lockfile rewrite |

## What this pin claims

| Item | Claimed? |
|------|----------|
| Real unified diff `0008-*.patch` (not a stub) | **Yes** |
| Vendored flattened crates under `third_party/darkstr/` | **Yes** |
| `DarkstrFfi.sys.mjs` declares/calls `darkstr_ffi_*` | **Yes** |
| `_readSnapshot`: empty snapshot + seed → **prefer FFI**, else JS mulberry | **Yes** |
| Apply-script markers + rebuild footer for 0008 | **Yes** |
| `nativePersonaHooks` default remains **false** | **Yes** (unchanged) |
| Mini apply + FFI build + `mach` + `nm`/`otool`/`dlopen` EXIT from this executor | **No — blocked** (see below) |
| Headed Proof XOR / merge-ready | **No** |
| Cloudflare / TLS / JA3 / RFP metrics | **No** |
| Approach A libxul-resident symbols | **No** |

## Mini verify steps (operator / Builder with machineId)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
cd ~/src/darkstr-gecko/darkstr
git fetch origin && git checkout builder/m-ffi-0008-gecko-link   # or main after merge
./patches/scripts/apply-darkstr-patches.sh --require-root
# Idempotent re-run should print: markers present — skip ...0008...

# Build Approach B cdylib into the objdir dist/bin (adjust objdir):
export DARKSTR_GECKO_OBJDIR=~/src/darkstr-gecko/librewolf-source/librewolf-155.0.1-1/obj-*
# or pass explicit --prefix:
"$DARKSTR_GECKO_ROOT/third_party/darkstr/build-and-install-ffi.sh" --prefix "$DARKSTR_GECKO_OBJDIR/dist/bin"
# Record EXIT of cargo/install.

# Smallest mach that picks up chrome ESM:
cd "$DARKSTR_GECKO_ROOT"
./mach build browser/components
# Record EXIT. Full ./mach build only if incremental fails / disk allows (~watch free space).

# Symbol smoke on the shipped dylib (not libxul for Approach B):
DYLIB="$DARKSTR_GECKO_OBJDIR/dist/bin/libduppel_ffi.dylib"
nm -gU "$DYLIB" | grep darkstr_ffi_
otool -L "$DYLIB" | head
# Optional dlopen smoke via a tiny C harness or python ctypes — confirm abi_version==1.
```

Also: `docs/M-FFI-0008-MINI-VERIFY.sh` when present.

## Proof XOR checklist (Builder pings Proof — do not claim PASS here)

- [ ] `cargo test -p duppel-ffi` (repo crates) green
- [ ] npm test / ffi-boundary markers green on this branch
- [ ] Mini: apply 0008 idempotent (markers skip on 2nd run)
- [ ] Mini: `build-and-install-ffi.sh` EXIT 0; `nm` shows `darkstr_ffi_persona_snapshot_json`
- [ ] Mini: `./mach build browser/components` EXIT 0
- [ ] Optional headed: Pollution + hooks on + seed 42 → snapshot matches goldens (Rust SoT), not mulberry-only
- [ ] STATUS honesty: Approach B only; no PM copy; hooks default-off

## Soft residuals / blockers

1. **Blocker for live Mini proof from authoring executor:** Shell `machineId` / local-exec to Mini (`e1a9473e-…`) was not available (commands ran on the Linux box only). Builder must re-run verify on Mini.
2. Soft: Approach A still future work if gkrust lock update is desired.
3. Soft: ctypes load fails closed → JS seed fallback (thinner than Rust goldens) until dylib is installed beside the binary.

## Rebuild targets

- FFI artifact: `third_party/darkstr/build-and-install-ffi.sh`
- Chrome: `./mach build browser/components`
