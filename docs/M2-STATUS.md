# Phase 2 M2 status — XOR mode→RFP applicator (control plane)

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Land the **authoritative XOR mode→RFP applicator** as a testable control plane:

1. Pollution → `privacy.resistFingerprinting=false`, `privacy.fingerprintingProtection=false`; enable persona/chaff unless `nativeCompatible`.
2. Homogeneous → stock RFP true / FPP stock-on restore; idle crates; **no** RFP metric customization.
3. **Forbidden** via prefs path: Pollution with RFP still true.

This PR is **docs + Rust + stub notes**. It does **not** claim live Gecko C++ pref observers, WebExt↔chrome privileged sync, bootstrap, or a rebuilt browser binary.

## Confirmed on main (pre-M2)

| Item | Value |
|------|-------|
| Base | `origin/main` @ `193cc9c` (M1 #14 prefs/cfg skim merged) |
| M1 prefs | `darkstr.cfg` / `defaultPref("darkstr.*")` apply path documented |
| Crate SoT | `duppel_persona::mode_pref_effects` + `duppel_bridge::PrefsApplicator` (M0.75+) |

## What this M2 drop ships

| Deliverable | Status |
|-------------|--------|
| `docs/M2-STATUS.md` (this file) | **New** |
| GECKO-HOOKS §1.2–1.3 M2 observer gates pin | Updated |
| PROOF-PIN / PROOF-XOR-CHECKLIST M2 notes | Updated |
| Rust: `mode_pref_effects` + `PrefsApplicator::apply_mode_effects` encode XOR table | Strengthened + tests |
| `PrefApplyPlan::is_xor_safe` / `allow_persona_chaff` | **New** guards |
| `patches/stubs/0002-darkstr-mode-xor-rfp.patch.stub` notes | Upgraded (still a stub) |
| Live C++/XPCOM pref observer in private tree | **Not claimed** |
| WebExt ↔ chrome privileged mirror sync | **Deferred** (still fork M2+ wiring) |
| `make bootstrap` / `make build` | **Out of scope** |

## Authoritative table (prefs path)

| `darkstr.mode` | `nativeCompatible` | RFP write | FPP write | persona/chaff |
|----------------|--------------------|-----------|-----------|---------------|
| `pollution` | `false` | `false` | `false` | **on** |
| `pollution` | `true` | `false` | `false` | off (global escape; mode unchanged) |
| `homogeneous` | `*` | `true` (stock) | stock-on restore | off (idle) |

**Release-fail:** `darkstr.mode=pollution` with `privacy.resistFingerprinting=true` via the applicator prefs path.  
Rust: `PrefApplyPlan::is_xor_safe()` must hold after `apply_mode_effects`.

## Rust call sites (no Gecko FFI yet)

```text
duppel_persona::mode_pref_effects(Mode, native_compatible) -> ModePrefEffects
duppel_bridge::PrefsApplicator::apply_mode_effects(...) -> PrefApplyPlan
duppel_bridge::PrefApplyPlan::is_xor_safe() / allow_persona_chaff()
```

Recording mock for CI: `duppel_bridge::RecordingApplicator`.

## Stub honesty

`0002-darkstr-mode-xor-rfp.patch.stub` documents the intended chrome observer → applicator flow. It is **not** a unified diff against a pinned Firefox/LibreWolf train. Do not invent untested C++ patches in this public repo.

## Mesh / Mini

- Clean gecko root remains on Builder Mini SSD (`docs/M1-STATUS.md`).
- **Atlas:** never `mv` under `/Volumes/Mesh`.
- M2 control-plane PR does not require live tree apply; future C++ observer wiring stays private-fork until train-pinned.

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | `docs/PHASE-2-PLAN.md` §M2, this file, `docs/GECKO-HOOKS.md` §1.2–1.3 |
| Proof | `docs/PROOF-XOR-CHECKLIST.md`, `docs/PROOF-PIN.md` M2 note, this file |
| PM | README positioning + this file “Goal” (no CF/TLS/bypass claims) |
| Builder | `crates/duppel-bridge`, `crates/duppel-persona`, stub `0002-…` |

## Proof gates for this PR

- [x] Pref keys stay `darkstr.mode` / `darkstr.nativeCompatible`
- [x] Pollution auto-kills RFP/FPP in Rust applicator
- [x] Homogeneous restores stock RFP expectations; crates idle; no metric customization claims
- [x] Forbidden Pollution+RFP=true impossible via `PrefsApplicator` path (unit-tested)
- [x] `cd crates && cargo test` green
- [x] `npm test` CI positioning denylist green
- [x] No claim of live Gecko C++ observers landed
- [x] Honest brand: darkstr, not official LibreWolf; no Cloudflare/TLS claims

## Next after merge

1. Private-fork: thin chrome pref observer calling `PrefsApplicator::apply_mode_effects` (train-pinned `.patch`, not invented here).
2. WebExt ↔ chrome mirror sync (fork-only privileged API) per `docs/PREF-BRIDGE.md` §6.
3. M3: nsHttp / Navigator native persona wins (`docs/GECKO-HOOKS.md` §2).
