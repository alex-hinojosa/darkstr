# Phase 2 M2 status — XOR mode→RFP applicator + train-pinned live observer

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

1. Authoritative XOR mode→RFP **control plane** in Rust (landed earlier on main via #15).
2. **Train-pinned live chrome pref observer** on LibreWolf / Firefox **155.0.1-1** that applies the same XOR table when `darkstr.mode` / `darkstr.nativeCompatible` change.

## Authoritative table (prefs path)

| `darkstr.mode` | `nativeCompatible` | RFP write | FPP write | persona/chaff |
|----------------|--------------------|-----------|-----------|---------------|
| `pollution` | `false` | `false` | `false` | **on** (WebExt / later M3) |
| `pollution` | `true` | `false` | `false` | off (global escape; mode unchanged) |
| `homogeneous` | `*` | `true` (stock) | stock-on (`true`) | off (idle) |

**Release-fail:** `darkstr.mode=pollution` with `privacy.resistFingerprinting=true` via the prefs path.

## What this drop ships

| Deliverable | Status |
|-------------|--------|
| Rust XOR applicator + `is_xor_safe` / `allow_persona_chaff` | **On main** (#15) |
| Real unified diff `patches/0002-darkstr-mode-xor-rfp.patch` | **New** — train-pinned |
| Chrome JS module `browser/components/DarkstrModeXor.sys.mjs` | **In patch** |
| Wire via `BrowserGlue.sys.mjs` + `moz.build` (`MOZ_SRC_FILES`) | **In patch** |
| Apply script applies `patches/000*.patch` | **Yes** |
| `docs/M2-MINI-VERIFY.sh` | **New** |
| Live C++ / XPCOM FFI into Rust crates | **Not claimed** |
| WebExt ↔ chrome privileged mirror sync | **First slice shipped** (Phase 2 prefs-bridge PR — see [`PREF-BRIDGE.md`](PREF-BRIDGE.md) §8); stock without experiments remains storage-only |
| Mini `mach build` from this PR author box | **Not claimed** (see honesty) |

## Train pin

| Item | Value |
|------|-------|
| Product train | LibreWolf **155.0.1-1** |
| Upstream tag used for hunk context | Mozilla `FIREFOX_155_0_1_RELEASE` (`browser/config/version.txt` = `155.0.1`) |
| Mini gecko root | `$DARKSTR_GECKO_ROOT` = `…/librewolf-source/librewolf-155.0.1-1` |
| Touched Gecko paths | `browser/components/DarkstrModeXor.sys.mjs` (new), `browser/components/moz.build`, `browser/components/BrowserGlue.sys.mjs` |

LibreWolf does **not** patch `BrowserGlue.sys.mjs` in its 155 patch set (verified via librewolf/source patch list), so the FIREFOX_155_0_1_RELEASE context matches the `make dir` tree.

## Hook shape (smallest honest chrome JS)

Not invented C++. A thin ESM chrome module:

1. `Services.prefs.addObserver` on `darkstr.mode` + `darkstr.nativeCompatible`
2. Also observes `privacy.resistFingerprinting` + `privacy.fingerprintingProtection` + `browser.contentblocking.category` (ContentBlockingPrefs.PREF_CB_CATEGORY on 155.0.1): under **Pollution** only, re-call `applyModeEffects` when those change (counter CB category stomps / strict `fpp` re-apply). **Homogeneous** ignores RFP/FPP/CB-category observer callbacks (do not fight user/stock).
3. On mode/native change (+ once at `BrowserGlue._init`): write only `privacy.resistFingerprinting` / `privacy.fingerprintingProtection` per the table above
4. After first `applyModeEffects` in `init`, schedule deferred re-apply (`Services.tm.dispatchToMainThread` + **dual** `idleDispatchToMainThread`) so early and late CB settle after BrowserGlue init is overridden under Pollution
5. Does **not** rewrite `darkstr.*` (no re-entrancy); keeps `_applying` guard
6. Does **not** customize RFP metrics / letterboxing
7. `nativeCompatible` is read for control-plane parity; persona/chaff stay WebExt until M3 native hooks

Semantics intentionally mirror `duppel_bridge::PrefsApplicator::apply_mode_effects` / `duppel_persona::mode_pref_effects`.

### Soft residual (Proof skim) — closed in this drop

Proof soft residual: under Pollution, FPP may still read true in test profiles when CB category (strict features include `fpp`) settles after ModeXor init, or when Proof skims stock LibreWolf / WebExt-only without `0002` applied+rebuilt. #21 added FPP/RFP observe + deferred apply; post-#23 soft residual strengthen also observes `browser.contentblocking.category` + dual idle. Honesty: prefs-path counter only — not a Full CB rewrite, FFI, or Mini re-Proof claim.

## Apply + rebuild (Mini SSD)

```bash
source ~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
# from a darkstr checkout that includes patches/0002-*.patch:
./patches/scripts/apply-darkstr-patches.sh --require-root
# or only the observer:
patch -d "$DARKSTR_GECKO_ROOT" -p1 < patches/0002-darkstr-mode-xor-rfp.patch

# Incremental (preferred):
cd "$DARKSTR_GECKO_ROOT"
./mach build browser/components
# or full incremental:
./mach build

# Verify helpers:
bash docs/M2-MINI-VERIFY.sh
```

Runtime skim after rebuild: Homogeneous → RFP true; set `darkstr.mode=pollution` → RFP/FPP false; back to homogeneous → RFP true. No metric customization.

**Atlas:** never `mv` under `/Volumes/Mesh`.

## Soft residual closure (2026-09-14)

FPP under Pollution (soft residual hygiene): observe `privacy.fingerprintingProtection` + `privacy.resistFingerprinting` + `browser.contentblocking.category`; re-assert RFP/FPP false only when `darkstr.mode===pollution`; dual-idle deferred apply after `init`. Homogeneous does not fight user/stock on RFP/FPP/CB prefs. If Proof still sees FPP=true: confirm fork `0002` is on the binary and wait past CB settle — WebExt pollution mode alone does not clear chrome FPP. Not claimed: CB rewrite, C++/FFI, Mini binary re-Proof.

## Honesty / non-claims

- This PR **does** ship a real unified diff against 155.0.1 BrowserGlue/moz.build paths (context taken from `FIREFOX_155_0_1_RELEASE`; dry-run apply verified on a pristine copy of those files).
- This PR **does not** claim: Mini SSD apply proof from the authoring executor, successful `mach build` on Mini, a new Proof-PASS binary artifact, WebExt↔chrome sync, or Rust FFI.
- Cfg-only M1 defaults remain required (`darkstr.*` defaultPref) so the observer has keys to read.
- Stub `patches/stubs/0002-…stub` is retained as a pointer only; apply script skips `*.stub`.

## Proof gates for this PR

- [x] Pref keys stay `darkstr.mode` / `darkstr.nativeCompatible`
- [x] Pollution auto-kills RFP/FPP in observer + Rust applicator
- [x] Homogeneous restores stock RFP expectations; no metric customization claims
- [x] Forbidden Pollution+RFP=true impossible via applicator/observer prefs path
- [x] Real patch paths exist on 155.0.1 train (BrowserGlue / moz.build); no fake C++ files
- [x] `cd crates && cargo test` green (unchanged control plane)
- [x] Honest brand: darkstr; no Cloudflare/TLS claims
- [ ] Mini apply + `mach build browser/components` — operator / Mini verify script

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | this file, `docs/GECKO-HOOKS.md` §1.2–1.3, `patches/0002-darkstr-mode-xor-rfp.patch` |
| Proof | `docs/PROOF-XOR-CHECKLIST.md`, `docs/PROOF-PIN.md` M2 note, this file |
| PM | Goal + honesty (no CF/TLS/bypass) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `docs/M2-MINI-VERIFY.sh` |
