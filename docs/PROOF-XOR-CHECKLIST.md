# Proof XOR checklist — gates for future wiring PRs

**Audience:** Proof (primary), Builder (self-check before review).  
**When:** Every PR that touches chrome prefs, RFP/FPP, persona/chaff activation, or WebExt↔chrome bridge.  
**Pin:** [`PROOF-PIN.md`](PROOF-PIN.md) · Bridge: [`PREF-BRIDGE.md`](PREF-BRIDGE.md) · Plan: [`PHASE-2-PLAN.md`](PHASE-2-PLAN.md).

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
