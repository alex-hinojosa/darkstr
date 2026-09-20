# Proof XOR checklist — gates for future wiring PRs

**Audience:** Proof (primary), Builder (self-check before review).  
**When:** Every PR that touches chrome prefs, RFP/FPP, persona/chaff activation, or WebExt↔chrome bridge.  
**Pin:** [`PROOF-PIN.md`](PROOF-PIN.md) · Bridge: [`PREF-BRIDGE.md`](PREF-BRIDGE.md) · Plan: [`PHASE-2-PLAN.md`](PHASE-2-PLAN.md).

## M2 applicator pin (prefs path)

When the PR touches XOR mode→RFP application (even docs/Rust-only):

- [ ] Table matches `duppel_persona::mode_pref_effects` / `duppel_bridge::PrefsApplicator::apply_mode_effects`
- [ ] Pollution → RFP=false, FPP=false; persona/chaff unless `nativeCompatible`
- [ ] Homogeneous → stock RFP true / FPP stock; idle crates; **no** RFP metric customization
- [ ] Forbidden: Pollution with RFP still true via prefs path (`PrefApplyPlan::is_xor_safe`)
- [ ] Live observer claims limited to train-pinned `patches/0002-darkstr-mode-xor-rfp.patch` (chrome JS `DarkstrModeXor.sys.mjs` on 155.0.1-1); no C++/Rust FFI claims without Proof on a fork artifact
- [ ] FPP under Pollution: fork `0002` applied+rebuilt; ModeXor observes RFP/FPP + `browser.contentblocking.category` + dual idle. Stock/WebExt-only profiles may still show FPP=true — not a WebExt XOR fail
- [ ] Status: [`M2-STATUS.md`](M2-STATUS.md) · Hooks: [`GECKO-HOOKS.md`](GECKO-HOOKS.md) §1.2–1.3 · Mini: [`M2-MINI-VERIFY.sh`](M2-MINI-VERIFY.sh)

## M3 hook-site pin (persona applicator enums)

When the PR touches nsHttp / Navigator / DocShell / MAIN inject native-path work (even docs/Rust-only):

- [ ] Firefox Client Hints policy is **REMOVE** only (never SET on Firefox host)
- [ ] Cached persona readable only when `pollution_active` (Homogeneous / Native-Compatible idle)
- [ ] `strictFirstDoc` first-nav vs subsequent-nav semantics preserved
- [ ] WebExt MAIN inject disabled (or feature-flagged off) when `darkstr.nativePersonaHooks` + pollution
- [ ] Chrome JS train-pinned patch only claims paths that exist on 155.x; no invented C++ files
- [ ] No claim that untested C++/Gecko FFI landed unless Proof-checked on a fork artifact
- [ ] Status: [`M3-STATUS.md`](M3-STATUS.md) · Hooks: [`GECKO-HOOKS.md`](GECKO-HOOKS.md) §2

## M4 chaff + depth pin

When the PR touches chaff scheduler, canvas/Audio/WebGL/worker depth, or strict-next-nav notes (even docs/Rust-only):

- [ ] Chaff arms only when `pollution_active` / `allow_persona_chaff` (Homogeneous / Native-Compatible / RFP conflict idle)
- [ ] Quiet/Balanced/Loud volume + timing remain Phase 1 poisoner-parity (or documented deltas)
- [ ] Depth seeds come from the same `PersonaSnapshot`; readable only when `pollution_active`
- [ ] Chaff timer `0016`: idle by default; Pollution+hooks → arms; Homogeneous/NC → idle; no `privacy.*` writes from module
- [ ] Depth hooks `0017` (canvas/WebGL/Audio): idle by default; Pollution+hooks+seeds → armed; Homogeneous/NC → idle; no `privacy.*` writes
- [ ] Worker hooks `0018` (Dedicated/Shared): idle by default; Pollution+hooks+persona → armed; Homogeneous/NC → idle; no `privacy.*` writes; ServiceWorker/Worklets **not** claimed
- [ ] No claim that worker hooks landed unless Proof-checked on a fork artifact (`0018` = Worker/SharedWorker constructor wrap; ServiceWorker out of scope)
- [ ] Soft residuals `0019` v2: worker `lastInstall` ok/installed (PASS on f18c0b6); OfflineAudio page-compartment → **nonzero deltaSum** and startRendering sums diverge from Homogeneous; HW best-effort (host OK if non-configurable)
- [ ] After Mini subdirectory `mach build`: `make install-dist_bin` + LibreWolf.app `moz-src` present (pin 1 lesson)
- [ ] Native-Compatible site list UI changes (if any) called out for Product Manager; prefer docs-only
- [ ] Track D Servo/Ladybird remains docs-only — no eng ship dependency
- [ ] Status: [`M4-STATUS.md`](M4-STATUS.md) · Hooks: [`GECKO-HOOKS.md`](GECKO-HOOKS.md) §2.2 / §2.5

---

Copy this checklist into the PR body (or link it) and check each applicable box. Unchecked release-fail items → do not merge.

---

## A. Pref identity (always)

- [ ] Pref keys remain `darkstr.mode` and `darkstr.nativeCompatible` (no rename to `duppel.*`).
- [ ] `darkstr.mode` values are only `homogeneous` \| `pollution` (illegal → homogeneous).
- [ ] `darkstr.nativeCompatible` is independent of mode (does not rewrite the enum).
- [ ] Defaults: mode=`homogeneous`, nativeCompatible=`false`.

## B. Mode exclusivity (release-fail if broken)

- [ ] Homogeneous **XOR** Pollution — no stacked / “both” representation.
- [ ] Forbidden combo impossible via prefs path: Pollution + `privacy.resistFingerprinting=true`.
- [ ] Pollution selection **auto-sets** `privacy.resistFingerprinting=false` and `privacy.fingerprintingProtection=false` (fork builds).
- [ ] Homogeneous selection **restores** stock LibreWolf RFP expectations.
- [ ] Homogeneous does **not** customize RFP metrics / letterbox tables / spoof RFP surfaces.
- [ ] Native-Compatible global escape turns surfaces off without changing `darkstr.mode`.
- [ ] Per-site `darkstr.nativeCompatSites` escape does not flip global mode.

## C. Crate / surface idle rules

- [ ] `duppel-persona` / `duppel-chaff` no-op when Homogeneous or Native-Compatible escape is active.
- [ ] Chaff does not run under RFP conflict (`rfp_xor_pollution`).
- [ ] `cargo test` in `crates/` green (includes `duppel_coherence` XOR matrix).

## D. HTTP ↔ JS coherence (when persona wiring lands)

- [ ] Single persona seed drives HTTP UA and JS navigator/platform.
- [ ] Firefox personas: Client Hints **REMOVE** / absent on the wire (A1).
- [ ] No UTC timezone letterbox under active Pollution.
- [ ] WebExt MAIN inject disabled (or clearly feature-flagged off) when native path is active.
- [ ] `duppel_coherence::assert_http_js_coherent` (or successor) passes on smoke fixtures.

## E. Positioning / non-goals (always)

- [ ] No TLS/JA3 spoof marketing, Cloudflare/Turnstile bypass claims, or anti-detect multi-account framing.
- [ ] No claim of being official LibreWolf.
- [ ] No Servo/Ladybird ship dependency in the PR.

## F. Stock LibreWolf companion (if WebExt-only path still supported)

- [ ] Document that auto-RFP kill is **fork-only**; stock path still requires manual about:config.
- [ ] Phase 1 UTC / RFP probe heuristic still gates surfaces on stock LibreWolf.
- [ ] Settings / chrome-prefs panel (if touched) still documents fork-only auto-RFP and PREF-BRIDGE key names.

---

## Quick matrix (must hold)

| mode | nativeCompatible | RFP on | Pollution surfaces |
|------|------------------|--------|--------------------|
| homogeneous | * | * | off |
| pollution | true | false | off (global escape) |
| pollution | false | false | **on** |
| pollution | * | true | off (`rfp_xor_pollution`) |

Automated mirror: `duppel_coherence::xor_matrix` + `cargo test -p duppel-coherence`.
