# Phase 2 M3-CPP-NAV status — C++ Navigator + DocShell stub

**Date:** 2026-09-15  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Land **real** train-pinned C++ Navigator overrides for the minimum field set already live in chrome `DarkstrNativePersonaChild` (`0003`), plus an **honest** DocShell stub, without regressing C++ nsHttp UA + CH REMOVE (`0005`) and without Rust FFI.

## What this drop ships

| Deliverable | Status |
|-------------|--------|
| Real unified diff `patches/0006-darkstr-cpp-navigator-docshell.patch` | **New** — train-pinned |
| `DarkstrNavigatorHooks.{h,cpp}` + `Navigator.cpp` call-ins | **In patch** |
| Fields: `userAgent`, `platform`, `hardwareConcurrency`, `languages` | **In patch** |
| `DarkstrDocShellHooks.{h,cpp}` + `nsDocShell::LoadURI` call-in | **Honest stub** — chrome counter remains SoT |
| Chrome mirrors (`platform` / HW / languages / `docShellPhase`) | **In patch** (extends `DarkstrNativePersona`) |
| CH REMOVE / nsHttp UA | **Unchanged** — stays `0005` |
| `deviceMemory` / `userAgentData` C++ | **Not claimed** — Firefox Navigator has no `deviceMemory`; chrome-JS remains |
| Rust FFI | **Not claimed** |
| Mini `./mach build dom/base docshell/base` EXIT | See honesty / Mini note |

## Train pin

| Item | Value |
|------|-------|
| Product train | LibreWolf **155.0.1-1** |
| Upstream tag context | Mozilla `FIREFOX_155_0_1_RELEASE` |
| Prerequisite | `0003` + `0005` applied |
| Touched paths | `DarkstrNavigatorHooks.*`, `Navigator.cpp`, `dom/base/moz.build`, `DarkstrDocShellHooks.*`, `nsDocShell.cpp`, `docshell/base/moz.build`, `DarkstrNativePersona.sys.mjs` |

## Hook shape (smallest compiling C++)

1. Same pref gate as `0005`: `darkstr.nativePersonaHooks` + `darkstr.mode==pollution` + `!darkstr.nativeCompatible`
2. Navigator getters early-return from chrome-mirrored prefs (`darkstr.persona.ua` already from `0005`; plus platform / HW / languages)
3. DocShell: `NoteTopLevelDocumentLoadAttempt()` no-op + `PhaseFromChromeMirror()` reads `darkstr.persona.docShellPhase` written by chrome counter
4. Default `darkstr.nativePersonaHooks=false` unchanged
5. **moz.build** entries kept **alphabetically** sorted (learned from #22 `UnsortedError`)

## Apply + rebuild (Mini SSD)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
# darkstr on this branch; 0003+0005 already on tree:
./patches/scripts/apply-darkstr-patches.sh --require-root
cd "$DARKSTR_GECKO_ROOT"
df -h .   # Atlas: never mv under /Volumes/Mesh
./mach build dom/base docshell/base
# record: echo mach EXIT=$?
bash docs/M3-CPP-NAV-MINI-VERIFY.sh
```

## Honesty / non-claims

- **Does** ship a real unified diff vs post-0005 155.0.1 Navigator + DocShell stub + chrome mirrors; dry-run/apply verified on a pristine post-0005 slice of those files.
- **Does not** claim: full C++ DocShell first/subsequent SoT (chrome counter remains), `deviceMemory` C++ override, Rust FFI, Cloudflare/TLS/JA3/bypass, Proof-PASS binary from this authoring executor.
- **Headed skim:** avoid `general.useragent.override` contamination (nsHttpHandler falls through when hooks idle).
- Authoring executor lacked Mini `ListMachines`/local-exec routing — Mini `mach` EXIT must be recorded on Mini SSD (or a machineId-capable Shell).

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; hooks default false
- [x] CH REMOVE not regresssed (no nsHttp edits in `0006`)
- [x] Same-seed mirrors as HTTP UA (`darkstr.persona.ua` + snapshot fields)
- [x] Real patch paths on 155.0.1 train; moz.build alphabetical
- [x] Docs: this file, GECKO-HOOKS, PROOF-PIN, patches/README, apply markers, verify script
- [x] `npm test` / `cargo test` green (control-plane)
- [ ] Mini apply + `mach build dom/base docshell/base` EXIT — Mini local-exec

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | this file, `docs/GECKO-HOOKS.md` §2, `patches/0006-…patch` |
| Proof | `docs/PROOF-XOR-CHECKLIST.md`, `docs/PROOF-PIN.md`, this file |
| PM | Goal + honesty (no CF/TLS/bypass) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `docs/M3-CPP-NAV-MINI-VERIFY.sh` |
