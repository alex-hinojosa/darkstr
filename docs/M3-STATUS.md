# Phase 2 M3 status — first native wins (`duppel-persona` hook sites)

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Document + encode **hook-site enums / applicator surfaces** for the first native wins:

1. **nsHttp** — User-Agent override + Client-Hints **REMOVE** (Firefox personas; never SET CH).
2. **Navigator** DOM bindings from the **same** persona seed as HTTP UA.
3. **DocShell** / `darkstr.strictFirstDoc` — first-nav native vs next-nav persona arm.
4. **Feature flag** `darkstr.nativePersonaHooks` — disable WebExt MAIN inject when native path active.
5. Glue **reads cached `PersonaSnapshot` only when `pollution_active`** (Homogeneous / Native-Compatible idle).

This PR is **docs + Rust enums/APIs + stub notes + optional Mini path-check helper**. It does **not** claim live C++/XPCOM observers, a unified diff verified against LibreWolf 155.0.1-1, bootstrap, or a rebuilt browser binary.

## Confirmed on main (pre-M3)

| Item | Value |
|------|-------|
| Base | `origin/main` @ `b23fc12` (M2 #15 XOR applicator merged) |
| M1 prefs | `darkstr.cfg` / `defaultPref("darkstr.*")` apply path |
| M2 XOR | `mode_pref_effects` / `PrefsApplicator` / `is_xor_safe` |
| Live tree (Mini, path checks only) | `$DARKSTR_GECKO_ROOT` = `…/librewolf-155.0.1-1` with M1 prefs |

## What this M3 drop ships

| Deliverable | Status |
|-------------|--------|
| `docs/M3-STATUS.md` (this file) | **New** |
| GECKO-HOOKS §2 M3 applicator surfaces pin | Updated |
| PROOF-PIN / PROOF-XOR-CHECKLIST / PHASE-2-PLAN M3 notes | Updated |
| Rust: `DocShellNavPhase`, `NativePersonaPlan`, CH-remove helpers, snapshot gate | **New** |
| Rust: `HookApplicatorSurface`, `NsHttpAction`, `NavigatorField`, `read_cached_persona` | **New** |
| Unit tests: pollution_active gating + CH-remove + MAIN inject flag | **New** |
| `patches/stubs/0003-darkstr-hook-sites.patch.stub` notes | Upgraded (still a stub) |
| Optional `docs/M3-MINI-VERIFY.sh` path existence checks | **New** (no Mesh hang) |
| Live C++/XPCOM nsHttp / Navigator / DocShell patch | **Not claimed** |
| Verified unified diff vs 155.0.1-1 | **Not claimed** |
| `make bootstrap` / `make build` / Firefox rebuild | **Out of scope** |

## Authoritative M3 control-plane table

| Gate | Behavior |
|------|----------|
| `pollution_active` | Only then may glue read cached `PersonaSnapshot` |
| Homogeneous / `nativeCompatible` / RFP conflict | Crates idle — no snapshot read, no UA/CH apply |
| Firefox CH | **REMOVE** only (`ClientHintsPolicy::Remove`); never SET |
| `strictFirstDoc=true` + FirstDocument | Stay native (no persona apply this nav) |
| `strictFirstDoc=true` + SubsequentNav | Persona may apply (if pollution + native hooks) |
| `darkstr.nativePersonaHooks=true` + pollution | WebExt MAIN inject **DisableNativePathActive** |
| Native hooks false | Phase 1 WebExt MAIN inject remains AllowFallback |

## Rust call sites (no Gecko FFI yet)

```text
duppel_persona::DocShellNavPhase / persona_armed_for_nav
duppel_persona::cached_snapshot_readable / NativePersonaPlan::resolve
duppel_persona::webext_main_inject_policy / ClientHintsPolicy::Remove
duppel_bridge::HookSite / HookApplicatorSurface / NsHttpAction / NavigatorField
duppel_bridge::m3_applicator_surfaces / read_cached_persona / native_persona_plan
```

## Stub honesty

`0003-darkstr-hook-sites.patch.stub` documents intended nsHttp / Navigator / DocShell call sites and points at the Rust enums above. It is **not** a unified diff against pinned Firefox/LibreWolf 155.0.1-1. Do **not** invent untested C++ patches in this public repo. Live tree on Mini is useful for **path existence checks only** until a train-pinned patch is Proof-verified.

## Mesh / Mini

- Clean gecko root remains on Builder Mini SSD (`docs/M1-STATUS.md`).
- **Atlas:** never `mv` under `/Volumes/Mesh`.
- Optional: `docs/M3-MINI-VERIFY.sh` — lists expected Gecko paths; does not apply patches or wait on Mesh.

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | `docs/PHASE-2-PLAN.md` §M3, this file, `docs/GECKO-HOOKS.md` §2 |
| Proof | `docs/PROOF-XOR-CHECKLIST.md` M3 pin, `docs/PROOF-PIN.md` M3 note, this file |
| PM | README positioning + this file “Goal” (no CF/TLS/bypass claims) |
| Builder | `crates/duppel-bridge`, `crates/duppel-persona`, stub `0003-…` |

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*` (adds `darkstr.nativePersonaHooks` feature flag name only)
- [x] CH policy for Firefox = REMOVE; unit-tested never SET
- [x] Snapshot cache readable only when `pollution_active`
- [x] DocShell first-nav vs next-nav encoded + tested
- [x] MAIN inject disabled when native hooks + pollution
- [x] `cd crates && cargo test` green
- [x] `npm test` CI positioning denylist green
- [x] No claim of live Gecko C++ hooks landed
- [x] Honest brand: darkstr, not official LibreWolf; no Cloudflare/TLS claims

## Next after merge

1. Private-fork: thin nsHttp UA + CH-remove glue calling `NativePersonaPlan` / cached snapshot (train-pinned `.patch`, Proof-checked on 155.0.1-1).
2. Navigator bindings from same seed; DocShell strict-first-doc flag.
3. Flip `darkstr.nativePersonaHooks` default only after fork smoke + coherence fixtures.
4. M4: chaff native + canvas/Audio depth (`HookSite::CanvasAudio`).
