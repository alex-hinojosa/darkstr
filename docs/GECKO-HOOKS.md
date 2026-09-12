# Gecko / LibreWolf integration hooks (Phase 2 sketch)

**Status:** Design pin for M1–M3. **No** Mozilla/LibreWolf source is vendored in this repo.  
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

| Integration | Upstream area (Firefox/LibreWolf) | darkstr action |
|-------------|-----------------------------------|----------------|
| Declare prefs | `modules/libpref/init/StaticPrefList.yaml` **or** `all.js` / product `.js` | Add `darkstr.mode` (String), `darkstr.nativeCompatible` (Bool), later `darkstr.strictFirstDoc` |
| Observe changes | Pref observer in chrome process (C++ or Rust static prefs callback) | On `darkstr.mode` change → call `PrefsApplicator::apply_mode_effects` |
| Mirror WebExt | Fork-only experimental API / native messaging | Bidirectional sync per [`PREF-BRIDGE.md`](PREF-BRIDGE.md) §2 |

**Authoritative in fork:** chrome prefs. WebExt `browser.storage.local` is a UI mirror until bridge lands.

### 1.3 XOR side-effects (release-fail if skipped)

When applying mode (see `duppel_persona::mode_pref_effects` / `duppel_bridge`):

| `darkstr.mode` | Write |
|----------------|-------|
| **`pollution`** | `privacy.resistFingerprinting = false`; `privacy.fingerprintingProtection = false`; enable persona/chaff path (unless Native-Compatible) |
| **`homogeneous`** | Restore LibreWolf **stock** RFP expectations (`privacy.resistFingerprinting = true`; FPP to stock path); **idle** crates; **do not** patch RFP metrics / letterbox tables |

`darkstr.nativeCompatible = true` leaves mode unchanged and disables spoof/chaff surfaces (global escape).

**Forbidden:** Pollution with `privacy.resistFingerprinting = true` via the prefs path.

Rust mirror (no Gecko link yet):

```text
duppel_persona::mode_pref_effects(Mode, native_compatible)
duppel_bridge::PrefsApplicator::apply_mode_effects(...)
```

---

## 2. Where crates call in later

Hooks below are **call sites**, not “rewrite Gecko in Rust.” Thin C++/XPCOM or Rust-in-Gecko glue calls into GPL crates; keep patch surface small.

### 2.1 `duppel-persona` — identity truth

| Surface | Gecko / LibreWolf area | When | Notes |
|---------|------------------------|------|-------|
| Process / profile start seed | Browser chrome init / content process launch | M3 | Seed before first content paint when possible |
| HTTP User-Agent | **nsHttp** / `nsHttpHandler` / channel `User-Agent` override | M3 | Single seed with JS navigator |
| Client Hints | nsHttp request header policy | M3 | Firefox personas: **REMOVE** / absent (A1) — never SET on Firefox host |
| `navigator.*` / platform / HW | DOM `Navigator` / related bindings | M3 | Same seed as HTTP UA |
| Feature flag | Pref / build flag | M3 | Disable WebExt MAIN inject when native path active |

**Idle when:** Homogeneous, Native-Compatible escape, or `rfp_xor_pollution`.

### 2.2 `duppel-chaff` — pollution scheduler

| Surface | Gecko / LibreWolf area | When | Notes |
|---------|------------------------|------|-------|
| Native timer / scheduler | Chrome process service or content idle tasks | M4 | Quiet/Balanced/Loud parity with Phase 1 `poisoner.js` |
| Beacon fetches | nsHttp (ordinary channels) | M4 | No TLS/JA3 games; no Cloudflare claims |
| Until native ready | Phase 1 `bridge.js` / `poisoner.js` | now | Authoritative on WebExt-only path |

**Idle when:** crates idle / XOR conflict (same gates as persona).

### 2.3 `duppel-coherence` — Proof harness

| Surface | Role | When |
|---------|------|------|
| CI / offline fixtures | Assert HTTP↔JS + XOR matrix (`assert_http_js_coherent`, `xor_matrix`) | M0.5+ |
| Optional in-browser smoke | Headed CreepJS / BrowserLeaks against fork artifacts | M3+ Proof |

Does **not** ship as user-facing UI. Does **not** reimplement CreepJS.

### 2.4 DocShell — strict-first-doc / next-nav

| Surface | Gecko area | When | Notes |
|---------|------------|------|-------|
| First document vs next nav | **DocShell** navigation / load state | M3→Phase 3 | Mirror Phase 1 `darkstr.strictFirstDoc`: first nav native; arm persona on subsequent main_frame |
| Pref | `darkstr.strictFirstDoc` | M2+ chrome | Semantics unchanged from Proof pin |

Until DocShell hooks land, WebExt tab-scoped DNR + MAIN inject remain the Phase 1 path.

### 2.5 Canvas / WebGL / Audio (depth — not first milestone)

| Surface | Gecko area | When | Notes |
|---------|------------|------|-------|
| Canvas 2D noise | `CanvasRenderingContext2D` / related | Phase 2→3 (M4+) | Seed from `PersonaSnapshot::canvas_seed` |
| WebGL renderer strings | WebGL bindings | M4+ | Correlate with persona GPU family |
| Audio fingerprint | AudioContext / OfflineAudioContext | M4+ | Seed from `audio_seed` |
| Workers | Dedicated/Shared worker globals | M4+ | Same persona coherence rules |

Out of scope for the first native wins (M3 = UA/CH + navigator minimum set).

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
        duppel_chaff scheduler arm (when native scheduler exists)
Else:
        clear persona cache; cancel chaff
```

nsHttp / Navigator / DocShell / canvas hooks **read** the cached snapshot only when activation says `pollution_active` — never invent a second seed.

---

## 4. What this repo ships vs what stays out-of-tree

| In `alex-hinojosa/darkstr` (public) | Private fork / Builder machine |
|-------------------------------------|--------------------------------|
| `docs/GECKO-HOOKS.md` (this file) | Full Firefox/LibreWolf source tree |
| `patches/` stubs + apply README | Real `.patch` bodies against pinned train |
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
