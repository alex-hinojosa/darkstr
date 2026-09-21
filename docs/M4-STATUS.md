# Phase 2 M4 status — chaff native + depth kickoff

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Goal (narrow)

Kick **chaff native + depth** into Phase 3 as a **control-plane** drop:

1. **`duppel-chaff` scheduler** behind prefs — Quiet/Balanced/Loud volume + timing parity with Phase 1 `poisoner.js`; gate on `pollution_active` / `allow_persona_chaff`.
2. **Canvas / Audio / WebGL + worker** coverage surfaces — enums/APIs/tests; seeds from `PersonaSnapshot` (`canvas_seed`, `audio_seed`, GPU family).
3. **DocShell strict-next-nav** notes — extend M3 `DocShellNavPhase` / `strict_next_nav_armed` (live DocShell still not claimed).
4. **Native-Compatible site list UI** — **docs / PM-facing notes only** this PR (prefer docs; no WebExt settings string changes).
5. **Track D** — optional one-paragraph quarterly Servo/Ladybird note — **no eng investment**.

This PR is **docs + Rust enums/APIs + stub notes**. It does **not** claim live C++/XPCOM chaff timers, canvas/WebGL/Audio hooks, a unified diff vs LibreWolf 155.x, bootstrap, or a rebuilt browser binary.

## Confirmed on main (pre-M4)

| Item | Value |
|------|-------|
| Base | `origin/main` @ `2f34b57` (M3 #16 persona hook-site enums merged) |
| M1–M3 | prefs/cfg apply · XOR applicator · nsHttp/Navigator/DocShell enums |
| Live tree (Mini, path checks only) | `$DARKSTR_GECKO_ROOT` = `…/librewolf-155.0.1-1` — do not invent train-pinned C++ |

## What this M4 drop ships

| Deliverable | Status |
|-------------|--------|
| `docs/M4-STATUS.md` (this file) | **New** |
| GECKO-HOOKS §2.2 / §2.5 M4 pin | Updated |
| PROOF-PIN / PROOF-XOR-CHECKLIST / PHASE-2-PLAN M4 notes | Updated |
| Rust: `ChaffSchedulerPlan` / `plan_fire` / Quiet·Balanced·Loud parity | **Strengthened** |
| Rust: `DepthSurface` + M4 applicator surfaces; depth seeds from snapshot | **New** |
| DocShell `strict_next_nav_armed` alias | **New** (same semantics as M3) |
| Unit tests: chaff gates + depth seed gate + volume/timing | **New** |
| `patches/stubs/0004-darkstr-chaff-depth.patch.stub` notes | **New** (still a stub) |
| Native-Compatible chrome privacy-pane site list UI | **Docs/PM only** — no UI string churn |
| Track D quarterly Servo/Ladybird note | **Docs only** (below) |
| Live C++/XPCOM chaff / canvas / WebGL / Audio / worker hooks | **Chrome JS lived in Phase 3:** `0016`/`0017`/`0018` (default-off). C++ depth/worker **not** claimed |
| `make bootstrap` / `make build` / Firefox rebuild | **Out of scope** |

## Authoritative M4 control-plane table

| Gate | Behavior |
|------|----------|
| `pollution_active` + `allow_chaff` | Native chaff scheduler **may arm** (`ChaffSchedulerPlan.armed`) |
| Homogeneous / `nativeCompatible` / RFP conflict | Scheduler cancel; no batches |
| Quiet / Balanced / Loud | Interval + batch + stagger parity with Phase 1 poisoner |
| Depth surfaces | Seed from same `PersonaSnapshot` only when `pollution_active` |
| DocShell strict-next-nav | `SubsequentNav` arm (`strict_next_nav_armed`) — **live in `0020`** |
| Native-Compatible site list | Phase 1 WebExt popup/list remains authoritative; chrome pane = later |

### Quiet / Balanced / Loud (poisoner parity)

| Level | Interval (min) | Batch size | Stagger base (ms) |
|-------|----------------|------------|-------------------|
| Quiet | 8–20 | 1 | 4000 |
| Balanced | 3–8 | 1–3 | 1500 |
| Loud | 1–3 | 5–15 | 500 |

## Rust call sites (no Gecko FFI yet)

```text
duppel_chaff::ChaffSchedulerPlan / scheduler_armed / plan_fire / ChaffFirePlan
duppel_chaff::ChaosLevel / ChaffSchedule (Quiet|Balanced|Loud)
duppel_bridge::DepthSurface / m4_depth_surfaces / m4_applicator_surfaces
duppel_bridge::allow_chaff_scheduler / read_depth_seeds
duppel_bridge::HookSite::{CanvasAudio, ChaffScheduler}
duppel_persona::prefs::CHAOS_LEVEL / strict_next_nav_armed
duppel_persona::PersonaSnapshot::depth_canvas_seed / depth_audio_seed / depth_webgl_gpu
```

## Native-Compatible site list UI (PM note)

**No WebExt / chrome UI string changes in this PR.** Product Manager skim:

- Phase 1 already ships popup **This site** / list / remove for `darkstr.nativeCompatSites`.
- Chrome privacy-pane site list remains a **Phase 2→3** chrome UX item (PREF-BRIDGE / fork pane), not blocked on M4 Rust.
- If a future PR changes user-visible strings (labels, empty states, “banking/SSO” copy), call it out explicitly for Product Manager review before merge.
- Prefer docs + storage/chrome key stability (`darkstr.nativeCompatSites`) over a settings panel churn this milestone.

## Track D — quarterly Servo / Ladybird note (no eng)

**2026-Q3 skim:** Servo and Ladybird remain **research-only**. Gecko/LibreWolf fork cost has not flipped; darkstr ships no Servo/Ladybird dependency, no engine-switch spike, and no eng allocation beyond this paragraph. Revisit only if merge-train burden clearly exceeds a one-time engine evaluation — Meridian owns the next quarterly note.

## Stub honesty

`0004-darkstr-chaff-depth.patch.stub` documents intended chaff timer / canvas / WebGL / Audio / worker call sites and points at the Rust enums above. It is **not** a unified diff against pinned Firefox/LibreWolf 155.0.1-1. Do **not** invent untested C++ patches in this public repo. Live Mini tree = **path existence checks only**.

## Mesh / Mini

- Clean gecko root remains on Builder Mini SSD (`docs/M1-STATUS.md`).
- **Atlas:** never `mv` under `/Volumes/Mesh`.
- No Firefox bootstrap/build in this PR.

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | `docs/PHASE-2-PLAN.md` §M4, this file, `docs/GECKO-HOOKS.md` §2.2 / §2.5 |
| Proof | `docs/PROOF-XOR-CHECKLIST.md` M4 pin, `docs/PROOF-PIN.md` M4 note, this file |
| PM | This file “Native-Compatible site list UI” + Track D paragraph (no CF/TLS claims) |
| Builder | `crates/duppel-chaff`, `crates/duppel-bridge`, stub `0004-…` |

## Proof gates for this PR

- [x] Pref keys stay `darkstr.*` (adds documented `darkstr.chaosLevel` pin only)
- [x] Chaff gated on `pollution_active` / `allow_persona_chaff`
- [x] Quiet/Balanced/Loud volume+timing parity unit-tested
- [x] Depth seeds readable only when `pollution_active`
- [x] DocShell strict-next-nav notes extended without claiming live hooks
- [x] No WebExt UI string changes (site list = docs/PM only)
- [x] Track D = one paragraph, no eng
- [x] `cd crates && cargo test` green
- [x] `npm test` CI positioning denylist green
- [x] No claim of live Gecko C++ chaff/canvas/WebGL/Audio hooks
- [x] Honest brand: darkstr, not official LibreWolf; no Cloudflare/TLS claims

## Next after merge

1. ~~Private-fork: thin chaff timer glue calling `ChaffSchedulerPlan` (train-pinned `.patch`).~~ → **Phase 3 pin 1:** `patches/0016-darkstr-chaff-native-scheduler.patch` — merged PR #43 / `d5fb026`; Mini XOR **PASS** after `install-dist_bin` (`docs/PHASE-3-STATUS.md`).
2. ~~Canvas/WebGL/Audio hooks reading depth seeds from cached snapshot when pollution_active.~~ → **Phase 3 pin 2:** `patches/0017-darkstr-depth-canvas-webgl-audio.patch` — merged PR #44 / `1eef97b`; Proof XOR **PASS** on tip `9d4fa76` (`docs/PHASE-3-STATUS.md`).
3. ~~Worker globals coherence with same persona seed.~~ → **Phase 3 pin 3:** `patches/0018-darkstr-worker-globals-coherence.patch` (`docs/PHASE-3-STATUS.md`).
3b. Soft residuals (lastInstall / OfflineAudio / HW best-effort) → **`patches/0019-darkstr-phase3-soft-residuals.patch`**.
4. Chrome privacy-pane Native-Compatible site list only when PM schedules UI work.
5. ~~DocShell strict-next-nav SubsequentNav arm (extends M3).~~ → **Phase 3:** `patches/0020-darkstr-docshell-strict-next-nav.patch` (`docs/PHASE-3-STATUS.md`).
6. ~~Richer WebGL cap buckets / OffscreenCanvas window parity.~~ → **Phase 3 optional:** `patches/0023-darkstr-depth-webgl-caps-offscreencanvas.patch` (`docs/PHASE-3-STATUS.md`).
