# Phase 2 M3 status — first native wins (train-pinned live hooks)

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

First **live** native persona wins on LibreWolf / Firefox **155.0.1-1**, mirroring Rust control plane from main (#16):

1. **nsHttp** — User-Agent override from persona snapshot when `pollution_active`
2. **Client Hints REMOVE** only (never SET) on Firefox host
3. **Minimum Navigator fields** from the same seed (platform / HW / languages / UA)
4. **Feature flag** `darkstr.nativePersonaHooks` — disable WebExt MAIN inject when native path + pollution
5. **DocShell-ish** first vs subsequent nav (top-level document load count; cheap chrome)

Prefer chrome JS / existing Gecko extension points over inventing C++.

## What this drop ships

| Deliverable | Status |
|-------------|--------|
| Real unified diff `patches/0003-darkstr-native-persona-hooks.patch` | **New** — train-pinned |
| `DarkstrNativePersona.sys.mjs` + Parent/Child JSWindowActor | **In patch** |
| Wire via `BrowserGlue.sys.mjs` + `moz.build` (after M2) | **In patch** |
| Pref `darkstr.nativePersonaHooks` in cfg / apply script | **Yes** |
| WebExt MAIN inject gate when flag true | **Yes** (`extension/`) |
| Rust enums / `NativePersonaPlan` (already on main #16) | **Unchanged SoT** |
| Live C++ / XPCOM / Rust FFI | Chrome M3: **not** C++. Follow-on: [`M3-CPP-STATUS.md`](M3-CPP-STATUS.md) (`0005` nsHttp only) |
| Mini `mach build` from this executor | See honesty |

## Train pin

| Item | Value |
|------|-------|
| Product train | LibreWolf **155.0.1-1** |
| Upstream tag context | Mozilla `FIREFOX_155_0_1_RELEASE` |
| Mini gecko root | `$DARKSTR_GECKO_ROOT` = `…/librewolf-source/librewolf-155.0.1-1` |
| Prerequisite | M2 `DarkstrModeXor` applied (#18 / `0757256`) |
| Touched Gecko paths | `DarkstrNativePersona*.sys.mjs` (new×3), `BrowserGlue.sys.mjs`, `moz.build` |

## Hook shape (smallest honest chrome JS)

1. Pref observers on mode / nativeCompatible / nativePersonaHooks / strictFirstDoc / persona snapshot|seed
2. `http-on-modify-request`: UA override when plan applies; CH headers **REMOVE** if present; never SET CH
3. JSWindowActor child spoofs minimum Navigator fields from the **same** snapshot
4. Top-level `TYPE_DOCUMENT` load count ≈ DocShell first vs subsequent (`strictFirstDoc`)
5. Snapshot from `darkstr.persona.snapshot` JSON **or** `darkstr.persona.seed` mulberry32 fallback (Firefox×host OS)
6. Idle when Homogeneous / `nativeCompatible` / hooks false / no snapshot|seed

Semantics mirror `duppel_persona::NativePersonaPlan` / `duppel_bridge::read_cached_persona`.

## Apply + rebuild (Mini SSD)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
# from darkstr checkout with patches/0002 + patches/0003:
./patches/scripts/apply-darkstr-patches.sh --require-root
# or only M3 (M2 already applied):
patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0003-darkstr-native-persona-hooks.patch

cd "$DARKSTR_GECKO_ROOT"
./mach build browser/components
# or full incremental:
./mach build

bash docs/M3-MINI-VERIFY.sh
```

**Atlas:** never `mv` under `/Volumes/Mesh`.

## Honesty / non-claims

- This PR **does** ship a real unified diff against post-M2 155.0.1 BrowserGlue/moz.build paths (dry-run apply verified on a pristine post-M2 copy of those files).
- This PR **does not** claim: Rust FFI, C++ nsHttpHandler edits, Proof-PASS binary artifact from this authoring executor, or WebExt↔chrome privileged sync of the snapshot pref (snapshot/seed may be set via about:config / later bridge).
- Default `darkstr.nativePersonaHooks=false` until fork smoke; flip only after Proof.
- Stub `patches/stubs/0003-…stub` retained as pointer; apply script skips `*.stub`.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*` (adds `darkstr.nativePersonaHooks` + optional persona snapshot/seed)
- [x] Firefox CH = REMOVE only; never SET in chrome glue
- [x] Snapshot/apply gated on pollution_active (+ hooks + nav phase)
- [x] DocShell first-nav vs subsequent encoded in chrome load counter
- [x] WebExt MAIN inject disabled when native hooks flag true
- [x] Real patch paths exist on 155.0.1 train; no fake C++ files
- [x] `cd crates && cargo test` / `npm test` green
- [x] Honest brand: darkstr; no Cloudflare/TLS claims
- [ ] Mini apply + `mach build` EXIT — operator / verify script (record when run)

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | this file, `docs/GECKO-HOOKS.md` §2, `patches/0003-darkstr-native-persona-hooks.patch` |
| Proof | `docs/PROOF-XOR-CHECKLIST.md` M3 pin, `docs/PROOF-PIN.md` M3 note, this file |
| PM | Goal + honesty (no CF/TLS/bypass) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `docs/M3-MINI-VERIFY.sh` |
