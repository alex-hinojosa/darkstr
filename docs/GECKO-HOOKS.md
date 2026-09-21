# Gecko / LibreWolf integration hooks (Phase 2 sketch)

**Status:** Design pin for M1–M3 (+M3-CPP / M3-CPP-NAV / M3-CPP-DOCSHELL). M2 XOR observer + **M3 live chrome native persona hooks** + **M3-CPP nsHttp C++** + **M3-CPP-NAV Navigator C++** + **M3-CPP-DOCSHELL C++ first/subsequent SoT** landed — see [`M2-STATUS.md`](M2-STATUS.md), [`M3-STATUS.md`](M3-STATUS.md), [`M3-CPP-STATUS.md`](M3-CPP-STATUS.md), [`M3-CPP-NAV-STATUS.md`](M3-CPP-NAV-STATUS.md), [`M3-CPP-DOCSHELL-STATUS.md`](M3-CPP-DOCSHELL-STATUS.md). **No** Mozilla/LibreWolf source is vendored in this repo. Rust FFI **boundary crate** + train-pinned **0008 Approach B** link authored ([`M-FFI-STATUS.md`](M-FFI-STATUS.md), [`M-FFI-0008-STATUS.md`](M-FFI-0008-STATUS.md)); Mini live apply/`mach` not claimed from every executor ([`SEED-COHERENCE.md`](SEED-COHERENCE.md)); DocShell first/subsequent **C++ counter is SoT** when `nativePersonaHooks` (chrome Map = fallback).  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**License note:** Our crates = GPL-3.0-only. Upstream Gecko patches remain MPL-2.0; counsel before binary distribution.

This document names the **exact call-in points** a private LibreWolf-based fork would use to:

1. Apply chrome prefs `darkstr.mode` / `darkstr.nativeCompatible`
2. Enforce XOR: Pollution → force RFP/FPP **off**; Homogeneous → restore **stock** RFP (no metric customization)
3. Later wire `duppel-persona` / `duppel-chaff` / `duppel-coherence` (DocShell nav, nsHttp, canvas)

Companion docs: [`PREF-BRIDGE.md`](PREF-BRIDGE.md), [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md), [`PHASE-2-PLAN.md`](PHASE-2-PLAN.md).  
Patch stubs (not a browser tree): [`../patches/`](../patches/).  
Rust applicator trait for future XPCOM glue: `duppel_bridge::PrefsApplicator`.

---

## 1. Pref application (M1–M2)

### 1.1 Defaults (`darkstr.cfg`)

Layer on LibreWolf’s `librewolf.cfg` baseline (do **not** replace upstream RFP defaults for Homogeneous).

| Pref | Default | Source |
|------|---------|--------|
| `darkstr.mode` | `"homogeneous"` | [`darkstr.cfg.example`](darkstr.cfg.example) / `patches/stubs/darkstr.cfg` |
| `darkstr.nativeCompatible` | `false` | same |
| `darkstr.strictFirstDoc` | `true` | same |

Ship path in fork tree (illustrative): `browser/app/profile/darkstr.js` **or** autoconfig `darkstr.cfg` next to LibreWolf’s cfg — Builder picks one; Proof pin stays on the **key names**.

### 1.2 Static prefs / observers

| Integration | Upstream area (Firefox/LibreWolf) | darkstr action | M2 status |
|-------------|-----------------------------------|----------------|-----------|
| Declare prefs | `modules/libpref/init/StaticPrefList.yaml` **or** `all.js` / product `.js` | Add `darkstr.mode` (String), `darkstr.nativeCompatible` (Bool), later `darkstr.strictFirstDoc` | Defaults via M1 `darkstr.cfg`; StaticPrefList still private-fork |
| Observe changes | Pref observer in chrome process (chrome JS ESM on 155.0.1-1) | On `darkstr.mode` / `darkstr.nativeCompatible` change → XOR write `privacy.resistFingerprinting` / `privacy.fingerprintingProtection` (same table as `PrefsApplicator::apply_mode_effects`). Also observes RFP/FPP + `browser.contentblocking.category`: under Pollution only, re-assert both false after CB stomps; dual-idle deferred apply after init. Homogeneous ignores RFP/FPP/CB-category callbacks. | **Rust applicator landed**; **live chrome JS observer** in `patches/0002-darkstr-mode-xor-rfp.patch` (`DarkstrModeXor.sys.mjs` via `BrowserGlue`); FPP soft residual = observe+dual-idle (+ CB category on 155); C++/Rust FFI **not** claimed |
| Mirror WebExt | Fork-only experimental API / native messaging | Bidirectional sync per [`PREF-BRIDGE.md`](PREF-BRIDGE.md) §2 | Deferred (fork wiring) |

**Authoritative in fork:** chrome prefs. WebExt `browser.storage.local` is a UI mirror until bridge lands.

### 1.3 XOR side-effects (release-fail if skipped)

When applying mode (see `duppel_persona::mode_pref_effects` / `duppel_bridge`) — **M2 observer XOR gates**:

| `darkstr.mode` | Write |
|----------------|-------|
| **`pollution`** | `privacy.resistFingerprinting = false`; `privacy.fingerprintingProtection = false`; enable persona/chaff path (unless Native-Compatible) |
| **`homogeneous`** | Restore LibreWolf **stock** RFP expectations (`privacy.resistFingerprinting = true`; FPP to stock-on path); **idle** crates; **do not** patch RFP metrics / letterbox tables |

`darkstr.nativeCompatible = true` leaves mode unchanged and disables spoof/chaff surfaces (global escape).

**Forbidden:** Pollution with `privacy.resistFingerprinting = true` via the prefs path.  
Guard: `duppel_bridge::PrefApplyPlan::is_xor_safe()` after `apply_mode_effects`.

Rust control plane (public repo — no Gecko FFI / no invented C++ in this drop):

```text
duppel_persona::mode_pref_effects(Mode, native_compatible)
duppel_bridge::PrefsApplicator::apply_mode_effects(...)
duppel_bridge::PrefApplyPlan::is_xor_safe() / allow_persona_chaff()
```

Real train-pinned patch: [`../patches/0002-darkstr-mode-xor-rfp.patch`](../patches/0002-darkstr-mode-xor-rfp.patch) (stub pointer retained). Status: [`M2-STATUS.md`](M2-STATUS.md).

---

## 2. Where crates call in later (M3 enums landed)

Hooks below are **call sites**, not “rewrite Gecko in Rust.” Thin C++/XPCOM or Rust-in-Gecko glue calls into GPL crates; keep patch surface small.

**M3 public-repo status:** Rust enums/APIs on main (#16) + chrome `0003` + C++ nsHttp `0005` + C++ Navigator [`../patches/0006-darkstr-cpp-navigator-docshell.patch`](../patches/0006-darkstr-cpp-navigator-docshell.patch) + C++ DocShell SoT [`../patches/0007-darkstr-cpp-docshell-nav-sot.patch`](../patches/0007-darkstr-cpp-docshell-nav-sot.patch) + FFI link [`../patches/0008-darkstr-gecko-ffi-link.patch`](../patches/0008-darkstr-gecko-ffi-link.patch) (Approach B). Mini symbol/`mach` proof operator-side until recorded. DocShell load-counter **C++ SoT** when hooks on. See [`M3-STATUS.md`](M3-STATUS.md) / [`M3-CPP-STATUS.md`](M3-CPP-STATUS.md) / [`M3-CPP-NAV-STATUS.md`](M3-CPP-NAV-STATUS.md) / [`M3-CPP-DOCSHELL-STATUS.md`](M3-CPP-DOCSHELL-STATUS.md).

Rust labels (no FFI yet):

```text
duppel_bridge::HookSite::{NsHttp, Navigator, DocShell}
duppel_bridge::HookApplicatorSurface / NsHttpAction / NavigatorField
duppel_bridge::m3_applicator_surfaces / read_cached_persona / native_persona_plan
duppel_persona::NativePersonaPlan / DocShellNavPhase / ClientHintsPolicy::Remove
duppel_persona::cached_snapshot_readable / webext_main_inject_policy
```

Glue reads cached `PersonaSnapshot` **only** when `pollution_active` (`read_cached_persona` / `cached_snapshot_readable`). Homogeneous and Native-Compatible stay idle.

### 2.1 `duppel-persona` — identity truth

| Surface | Gecko / LibreWolf area | When | M3 status |
|---------|------------------------|------|-----------|
| Process / profile start seed | Browser chrome init / content process launch | M3 | Enum/plan only — live seed wiring private-fork |
| HTTP User-Agent | **nsHttp** C++ `UserAgent()` + chrome `http-on-modify-request` | M3 / M3-CPP | Live chrome `0003` + C++ `0005` (`DarkstrNsHttpHooks`); Rust label `OverrideUserAgent` |
| Client Hints | nsHttp request header policy | M3 / M3-CPP | REMOVE in `0003` + C++ `0005` (never SET); Rust `ClientHintsPolicy::Remove` |
| `navigator.*` / platform / HW | JSWindowActor child + **C++** `Navigator.cpp` | M3 / M3-CPP-NAV | Live chrome `0003` + C++ `0006` (`DarkstrNavigatorHooks`); `deviceMemory`/`userAgentData` stay chrome on Firefox host |
| Feature flag | `darkstr.nativePersonaHooks` | M3 | Pref + WebExt MAIN inject gate + chrome plan |

**Headed skim:** avoid `general.useragent.override` contamination — nsHttpHandler falls through to it when darkstr hooks are idle; clear it for CreepJS/BrowserLeaks on fork profiles.

**Idle when:** Homogeneous, Native-Compatible escape, or `rfp_xor_pollution`.

### 2.2 `duppel-chaff` — pollution scheduler

| Surface | Gecko / LibreWolf area | When | M4 / Phase 3 status |
|---------|------------------------|------|---------------------|
| Native timer / scheduler | Chrome `DarkstrChaffScheduler.sys.mjs` (`nsITimer`) | M4→**P3 pin 1** | Rust plan encoded; **live timer in `0016`** (default-off: needs `nativePersonaHooks`) — see `PHASE-3-STATUS.md` |
| Volume + timing | Schedule plan (Rust) + chrome timer | M4 / P3 | Interval / batch / stagger match Phase 1 `poisoner.js` |
| Pref gate | `darkstr.chaosLevel` + mode / nativeCompatible / `nativePersonaHooks` | M4 / P3 | Arms only when `pollution_active` **and** hooks allowed (default-off) |
| Beacon fetches | Ordinary HTTP (`fetch` / channels) to poisoner endpoints | P3 pin 1 | No TLS/JA3 games; no Cloudflare claims; thin query payload |
| Until native ready | Phase 1 `bridge.js` / `poisoner.js` | now | Authoritative on WebExt-only path |

**Idle when:** crates idle / XOR conflict (same gates as persona).  
**Live scheduler patch:** [`../patches/0016-darkstr-chaff-native-scheduler.patch`](../patches/0016-darkstr-chaff-native-scheduler.patch). **Live depth (canvas/WebGL/Audio):** [`../patches/0017-darkstr-depth-canvas-webgl-audio.patch`](../patches/0017-darkstr-depth-canvas-webgl-audio.patch). **Live workers:** [`../patches/0018-darkstr-worker-globals-coherence.patch`](../patches/0018-darkstr-worker-globals-coherence.patch). **Live DocShell SubsequentNav:** [`../patches/0020-darkstr-docshell-strict-next-nav.patch`](../patches/0020-darkstr-docshell-strict-next-nav.patch). Stub `0004` historical. Status: [`PHASE-3-STATUS.md`](PHASE-3-STATUS.md) · [`M4-STATUS.md`](M4-STATUS.md).

### 2.3 `duppel-coherence` — Proof harness

| Surface | Role | When |
|---------|------|------|
| CI / offline fixtures | Assert HTTP↔JS + XOR matrix (`assert_http_js_coherent`, `xor_matrix`) | M0.5+ |
| Optional in-browser smoke | Headed CreepJS / BrowserLeaks against fork artifacts | M3+ Proof |

Does **not** ship as user-facing UI. Does **not** reimplement CreepJS.

### 2.4 DocShell — strict-first-doc / strict-next-nav

| Surface | Gecko area | When | Status |
|---------|------------|------|--------|
| First document vs next nav | Top-level document LoadURI count (C++) + chrome fallback | M3 / M3-CPP-NAV / M3-CPP-DOCSHELL | **C++ SoT** in `0007` `DarkstrDocShellHooks` when hooks on; chrome Map/`0003` fallback; `0006` stub superseded |
| Pref | `darkstr.strictFirstDoc` | M1+ chrome defaults | Semantics unchanged from Proof pin |
| SubsequentNav arm | `StrictNextNavArmed` + phase mirror gates Navigator/nsHttp UA + chrome Depth/Worker delivery | Phase 3 / **`0020`** | **Live** in [`../patches/0020-darkstr-docshell-strict-next-nav.patch`](../patches/0020-darkstr-docshell-strict-next-nav.patch); diagnostic `darkstr.docshell.strictNextNavArmed` |

M4 named **strict-next-nav** (`duppel_persona::strict_next_nav_armed`). Live arm: `0020` wires existing `ShouldApplyPersona` into C++ Navigator + nsHttp UA and chrome per-BC delivery (default-off). Until `darkstr.nativePersonaHooks` is flipped on a fork build, WebExt tab-scoped DNR + MAIN inject remain the Phase 1 path (`WebExtMainInjectPolicy::AllowFallback`).

### 2.5 Canvas / WebGL / Audio + workers (M4 depth → Phase 3)

| Surface | Gecko area | When | M4 / Phase 3 status |
|---------|------------|------|---------------------|
| Canvas 2D noise | Chrome `DarkstrDepthHooksChild` (`toDataURL`/`toBlob`/`getImageData`) | M4→**P3 pin 2** | `DepthSurface::Canvas2d` + `depth_canvas_seed`; **live in `0017`** (default-off) |
| WebGL renderer strings | Same actor — `getParameter(0x9245/0x9246)` + `readPixels` noise | M4→**P3 pin 2** | `DepthSurface::WebGl` + `depth_webgl_gpu`; **live in `0017`** |
| Audio fingerprint | Same actor — page-compartment `AudioBuffer.getChannelData` + OfflineAudio `startRendering` | M4→**P3 pin 2** + **0019 v2** | `DepthSurface::{AudioContext, OfflineAudioContext}` + `depth_audio_seed`; **live in `0017`/`0019`**; chrome Xray set FAIL → page `installAudioInPage` |
| Workers | Dedicated/Shared worker globals | M4→**P3 pin 3** | `DepthSurface::{DedicatedWorker, SharedWorker}`; **live in `0018`** (default-off) |

Depth seeds readable only when `pollution_active` (`duppel_bridge::read_depth_seeds`); chrome also requires `darkstr.nativePersonaHooks` (default-off).  
Enums: `duppel_bridge::m4_depth_surfaces` / `m4_applicator_surfaces`.  
**Live depth patch:** [`../patches/0017-darkstr-depth-canvas-webgl-audio.patch`](../patches/0017-darkstr-depth-canvas-webgl-audio.patch).  
**Live worker patch:** [`../patches/0018-darkstr-worker-globals-coherence.patch`](../patches/0018-darkstr-worker-globals-coherence.patch). **Soft residuals:** [`../patches/0019-darkstr-phase3-soft-residuals.patch`](../patches/0019-darkstr-phase3-soft-residuals.patch) (lastInstall runtimeOnly; OfflineAudio content-key; HW best-effort). **DocShell SubsequentNav:** [`../patches/0020-darkstr-docshell-strict-next-nav.patch`](../patches/0020-darkstr-docshell-strict-next-nav.patch). Stub `0004` historical. Status: [`PHASE-3-STATUS.md`](PHASE-3-STATUS.md) · [`M4-STATUS.md`](M4-STATUS.md).

M3 first native wins remain UA/CH + navigator minimum set; Phase 3 pin 2 adds canvas/WebGL/Audio chrome depth; pin 3 adds DedicatedWorker/SharedWorker constructor wrap (persona + OffscreenCanvas/WebGL in worker globals). ServiceWorker/Worklets not claimed.

---

## 3. Suggested observer → applicator flow

```
darkstr.mode / darkstr.nativeCompatible change
        │
        ▼
Pref observer (chrome process)
        │
        ▼
duppel_bridge::PrefsApplicator::apply_mode_effects
        │  writes privacy.resistFingerprinting / fingerprintingProtection
        │  reports ModePrefEffects { crates_idle, … }
        ▼
If !crates_idle && Pollution:
        duppel_persona::generate_persona_if_active → cache snapshot
        duppel_chaff::ChaffSchedulerPlan arm → DarkstrChaffScheduler (0016; default-off)
Else:
        clear persona cache; cancel chaff
```

nsHttp / Navigator / DocShell / canvas hooks **read** the cached snapshot only when activation says `pollution_active` — never invent a second seed.  
M3 API: `duppel_bridge::read_cached_persona` / `duppel_persona::cached_snapshot_readable`. Live patch: [`0003-darkstr-native-persona-hooks.patch`](../patches/0003-darkstr-native-persona-hooks.patch) · stub pointer retained · [`M3-STATUS.md`](M3-STATUS.md).  
M4 API: `duppel_chaff::ChaffSchedulerPlan` / `duppel_bridge::read_depth_seeds` / `m4_depth_surfaces`. Live timer: [`0016-…`](../patches/0016-darkstr-chaff-native-scheduler.patch). Live depth (canvas/WebGL/Audio): [`0017-…`](../patches/0017-darkstr-depth-canvas-webgl-audio.patch). Live workers: [`0018-…`](../patches/0018-darkstr-worker-globals-coherence.patch) · [`PHASE-3-STATUS.md`](PHASE-3-STATUS.md). Leftovers stub: [`0004-…`](../patches/stubs/0004-darkstr-chaff-depth.patch.stub) · [`M4-STATUS.md`](M4-STATUS.md).

---

## 4. What this repo ships vs what stays out-of-tree

| In `alex-hinojosa/darkstr` (public) | Private fork / Builder machine |
|-------------------------------------|--------------------------------|
| `docs/GECKO-HOOKS.md` (this file) | Full Firefox/LibreWolf source tree |
| `patches/` stubs + **real** `0002`/`0003`/`0005`/`0006`/`0007`/`0008` + apply README | Apply / rebuild on private 155.0.1-1 tree (`mach build` touched dirs; 0008 also builds cdylib) |
| `docs/darkstr.cfg.example` | Shipped `darkstr.cfg` in product |
| `crates/duppel-*` + `duppel-bridge` | `moz.build` / workspace link into Gecko |
| Phase 1 `extension/` companion | Branding, about:, icons |

Do **not** vendor Mozilla or LibreWolf trees into this repository unless product explicitly revisits that choice.

---

## 5. Proof gates for wiring PRs

Every prefs / nsHttp / DocShell / canvas PR must run [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md). Minimum:

- Pref keys stay `darkstr.*` (no `duppel.pollution.enabled`)
- Pollution auto-kills RFP/FPP; Homogeneous restores stock RFP **without** metric customization
- No TLS/JA3, Cloudflare, or “official LibreWolf” claims
- `cd crates && cargo test` green

---

## 6. Non-goals (repeat)

- Full Mozilla/LibreWolf clone in this PR or as a default layout
- Rewriting Gecko in Rust
- Customizing Homogeneous RFP metrics
- Servo/Ladybird ship path (Track D only)
