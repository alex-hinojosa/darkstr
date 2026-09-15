# Phase 2 M3-CPP-DOCSHELL status — C++ DocShell first/subsequent SoT

**Date:** 2026-09-15  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Replace the #23 honest DocShell **stub** with a **real** train-pinned C++ per-BrowsingContext top-level document counter that is the source of truth for `darkstr.strictFirstDoc` gating when `darkstr.nativePersonaHooks` is on — without regressing Navigator (`0006`) / nsHttp UA+CH REMOVE (`0005`) and without Rust FFI / RFP metric / CF/TLS patches.

## What this drop ships

| Deliverable | Status |
|-------------|--------|
| Real unified diff `patches/0007-darkstr-cpp-docshell-nav-sot.patch` | **New** — train-pinned |
| `DarkstrDocShellHooks` per-BC LoadURI counter + `CurrentPhase` / `ShouldApplyPersona` | **In patch** |
| `nsDocShell::LoadURI` call-in passes `BrowsingContext::Id()` | **In patch** |
| Chrome `navPhaseForChannel` prefers C++ mirror when hooks on | **In patch** |
| Gate: pollution + `nativePersonaHooks` (default false) + `!nativeCompatible` | **Unchanged** |
| CH REMOVE / nsHttp / Navigator field overrides | **Unchanged** — stay `0005` / `0006` |
| Rust FFI / RFP metrics / Cloudflare/TLS | **Not claimed** |
| Mini `./mach build docshell/base` EXIT | See Mini note |

## Train pin

| Item | Value |
|------|-------|
| Product train | LibreWolf **155.0.1-1** |
| Upstream tag context | Mozilla `FIREFOX_155_0_1_RELEASE` |
| Prerequisite | `0003` + `0005` + `0006` applied |
| Touched paths | `DarkstrDocShellHooks.{h,cpp}`, `nsDocShell.cpp`, `DarkstrNativePersona.sys.mjs` |
| moz.build | **No change** — `DarkstrDocShellHooks.cpp` already alphabetical from `0006` |

## Hook shape (smallest compiling C++)

1. Same pref gate as `0005`/`0006`: `darkstr.nativePersonaHooks` + `darkstr.mode==pollution` + `!darkstr.nativeCompatible`
2. On top-content `nsDocShell::LoadURI`, increment per-BC counter (document-nav analogue of chrome `TYPE_DOCUMENT`)
3. `CurrentPhase(bcId)` / `ShouldApplyPersona(bcId)` honor `darkstr.strictFirstDoc` (default true → first stays native)
4. Best-effort write `darkstr.persona.docShellPhase` mirror for chrome/nsHttp coherence (global pref; same multi-tab limitation as `0006`)
5. Chrome Map remains **fallback** when hooks idle or mirror unset — **not** SoT when hooks on

## Apply + rebuild (Mini SSD)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
# darkstr on this branch; 0003+0005+0006 already on tree:
./patches/scripts/apply-darkstr-patches.sh --require-root
cd "$DARKSTR_GECKO_ROOT"
df -h .   # Atlas: never mv under /Volumes/Mesh
./mach build docshell/base
# record: echo mach EXIT=$?
# full relink only if incremental leaves unresolved symbols
bash docs/M3-CPP-DOCSHELL-MINI-VERIFY.sh
```

## Honesty / non-claims

- **Does** ship a real unified diff vs post-0006 155.0.1 DocShell hooks + chrome prefer-C++ mirror; dry-run verified on a post-0006 slice.
- **Does** claim: C++ per-BC counter is SoT for DocShell phase API / `ShouldApplyPersona` when hooks on.
- **Does not** claim: parent/content IPC for multi-process mirror perfection; Navigators/`0005` nsHttp auto-gated via `ShouldApplyPersona` call-ins yet (API exposed; chrome still gates HTTP via phase mirror); Rust FFI; Cloudflare/TLS/JA3; Proof-PASS binary from authoring executor alone.
- Headed skim: avoid `general.useragent.override` contamination.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*`; hooks default false
- [x] CH REMOVE not regresssed (no nsHttp edits in `0007`)
- [x] Same-seed coherence with nsHttp/Navigator mirrors
- [x] Real patch paths on 155.0.1 train; moz.build unchanged (already alphabetical)
- [x] Docs: this file, GECKO-HOOKS, PROOF-PIN, patches/README, apply markers, verify script
- [ ] `npm test` / `cargo test` green (control-plane)
- [ ] Mini apply + `mach build docshell/base` EXIT — run `docs/APPLY-M3-CPP-DOCSHELL-ON-MINI.sh` on machineId e1a9473e… (authoring executor Shell is box-only; Mini local-exec required)

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | this file, `docs/GECKO-HOOKS.md` §2.4, `patches/0007-…patch` |
| Proof | `docs/PROOF-XOR-CHECKLIST.md`, `docs/PROOF-PIN.md`, this file |
| PM | Goal + honesty (no CF/TLS/bypass) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `docs/M3-CPP-DOCSHELL-MINI-VERIFY.sh` |
