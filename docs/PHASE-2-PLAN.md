# Phase 2 plan — darkstr private LibreWolf-based fork + Rust crates

**To:** Builder, Proof, Alex  
**From:** Meridian roadmap (Phase 2 execution plan)  
**Date:** 2026-09-12  
**Repo:** https://github.com/alex-hinojosa/darkstr  
**License:** GPL-3.0-only  
**Brand:** **darkstr** — pollution browser. **Not** official LibreWolf. **Not** anti-detect. **Not** Cloudflare bypass.

Phase 1 (Firefox WebExtension on stock LibreWolf) is on `main`. This document plans Phase 2: bootstrap a **private LibreWolf-based fork**, put Duppel’s control plane in **Rust crates**, and wire them into Gecko **behind prefs**. It does **not** authorize rewriting LibreWolf/Gecko in Rust. Servo / Ladybird = **Track D research only**.

Upstream recipe: [LibreWolf](https://librewolf.net/) / Codeberg `librewolf/source` + bsys6-style Docker. Meridian brief: `research/duppel/LIBREWOLF-DUPPEL-RUST-ROADMAP-2026-09-12.md` (local) / team Meridian roadmap 2026-09-12.

---

## 0. One-line verdict

Fork LibreWolf’s Firefox train, keep security cadence, brand as **darkstr**, and ship **Homogeneous XOR Pollution** (+ independent **Native-Compatible**) with Rust crates as the source of truth for persona/chaff. Phase 1 WebExt remains the UI + bridge until chrome prefs and native hooks exist.

---

## 1. Goals and non-goals

### Goals

1. Private **LibreWolf-based** browser tree branded **darkstr** (theming, about:, prefs UI — not “LibreWolf with extras” upstream).
2. Rust crates `duppel-persona`, `duppel-chaff`, `duppel-coherence` compile in-repo; eventually linked into the fork behind prefs.
3. Chrome prefs mirror Phase 1 keys: `darkstr.mode`, `darkstr.nativeCompatible` (plus site map / strict-first-doc as they graduate).
4. **Mode exclusivity:** Homogeneous (stock RFP) **XOR** Pollution (Duppel engine; RFP/FPP auto-off). Native-Compatible is an escape, not a third XOR arm.
5. First native wins: unified UA/CH at process start; persona seed before first content process paint where possible.
6. Explicit public line: pollution browser, not Cloudflare bypass, not LibreWolf official.

### Non-goals (Phase 2 and forever unless product revisits)

- Rewrite LibreWolf / Gecko in Rust.
- Ship Servo or Ladybird as the engine (Track D only).
- Upstream pollution patches to LibreWolf or Mozilla RFP (political / doctrine conflict).
- TLS/JA3 spoof marketing, “beats Cloudflare/Turnstile,” anti-detect multi-account lane.
- Full in-engine canvas/WebGL/Audio + DocShell strict-nav + native chaff scheduler in the **first** Phase 2 milestone (those are Phase 2→3 depth; see milestones).

---

## 2. Modes and prefs (product lock)

| Mode / flag | Behavior |
|-------------|----------|
| **Homogeneous** | Stock LibreWolf RFP anonymity set. No Duppel persona. Rust crates idle. |
| **Pollution** | Duppel persona + chaff path. RFP and FPP **must** be off (fork auto-sets when Pollution selected). |
| **Native-Compatible** | Independent bool (and later per-site map). Restores native identity for banking/SSO without rewriting `darkstr.mode`. |

**Forbidden:** `darkstr.mode = pollution` with `privacy.resistFingerprinting = true` (release-fail; Phase 1 already refuses via heuristic).

### Pref names (stable across Phase 1 → 2)

| Key | Phase 1 today | Phase 2 chrome |
|-----|---------------|----------------|
| `darkstr.mode` | `browser.storage.local` string `homogeneous` \| `pollution` | `about:config` / `darkstr.cfg` string (same values) |
| `darkstr.nativeCompatible` | storage bool | chrome bool |
| `darkstr.nativeCompatSites` | storage `{ [etld1]: true }` | chrome JSON pref or profile file + WebExt mirror |
| `darkstr.strictFirstDoc` | storage bool (default true) | chrome bool; later DocShell flag |

Internal / product (may stay storage longer): `darkstr.chaosLevel`, session seed/profile, first-run flags.

Fork may also expose a **single UI pref** that maps to the XOR enum (privacy pane), but the string values above remain the Proof pin.

Meridian’s earlier sketch used `duppel.pollution.enabled`; **darkstr brand wins** — use `darkstr.mode` / `darkstr.nativeCompatible` as in Phase 1 Proof pin (`docs/PROOF-PIN.md`).

---

## 3. Crate boundaries

Workspace root: [`crates/`](../crates/) (Cargo workspace). Stubs land with this plan; no full Gecko patch in the same PR.

```
crates/
  Cargo.toml                 workspace
  duppel-persona/            persona families, seed/rotation, validators
  duppel-chaff/              beacon schedules, endpoints, pollution metrics
  duppel-coherence/          HTTP↔JS assertion harness (Proof QA)
```

### `duppel-persona`

**Owns:** correlated persona structs; seeded generation; family filters (Firefox + host OS, Linux included); rotation; validators that say “this snapshot is internally coherent.”

**Does not own:** network I/O, DOM injection, UI, RFP implementation.

**Consumers:** Gecko FFI (necko / navigator overrides), `duppel-coherence`, optionally WebExt via native messaging for inspector parity.

### `duppel-chaff`

**Owns:** Quiet/Balanced/Loud schedules; endpoint lists; timing; pollution metrics counters.

**Does not own:** uBO / tracker blocklists; TLS fingerprint games.

**Consumers:** native scheduler in fork; until then Phase 1 `poisoner.js` / `bridge.js` remain authoritative in the WebExt-only path.

### `duppel-coherence`

**Owns:** assertion API over persona snapshots + observed HTTP/JS probes; mode-exclusivity fixtures; CI helpers for Proof.

**Does not own:** shipping UI; reimplementing CreepJS.

**Depends on:** `duppel-persona` (snapshot types).

### Shared rules

- `#![forbid(unsafe_code)]` in stubs; any future FFI boundary crate is separate and reviewed.
- GPL-3.0-only (same as Duppel / darkstr). Firefox/LibreWolf MPL patches stay MPL; counsel pass before distribution (Phase 4).
- Crates must no-op when Homogeneous or Native-Compatible escape is active.

---

## 4. Pref bridge: WebExt → chrome

Phase 1 cannot write `privacy.resistFingerprinting` (extension limitation). Phase 2 fork **can** and **must** when Pollution is selected.

### Target architecture

```
┌─────────────────────────────────────────────────────────┐
│  darkstr WebExt (Phase 1+ companion)                    │
│  popup / sidebar / first-run / identity inspector        │
│  browser.storage.local  ↔  sync bridge                  │
└─────────────┬───────────────────────────────────────────┘
              │  (A) experimental WebExt API / native msg
              │  (B) chrome.pref observer (privileged)
              ▼
┌─────────────────────────────────────────────────────────┐
│  Chrome prefs (about:config / darkstr.cfg)              │
│  darkstr.mode / darkstr.nativeCompatible / …            │
│  On Pollution: force RFP=false, FPP=false               │
│  On Homogeneous: restore LibreWolf RFP defaults         │
└─────────────┬───────────────────────────────────────────┘
              │  pref observers / XPCOM / Rust static prefs
              ▼
┌─────────────────────────────────────────────────────────┐
│  Rust crates (duppel-*)                                 │
│  persona seed at process start; chaff scheduler gated   │
└─────────────┬───────────────────────────────────────────┘
              │  thin C++/XPCOM or Rust-in-Gecko hooks
              ▼
┌─────────────────────────────────────────────────────────┐
│  Gecko surfaces: necko UA/CH, DOM navigator, later      │
│  canvas/WebGL/Audio, DocShell strict-next-nav           │
└─────────────────────────────────────────────────────────┘
```

### Bridge principles

1. **Chrome prefs are authoritative** in the fork build. WebExt storage becomes a cache/UI mirror.
2. Sync is bidirectional during transition: changing popup mode writes chrome pref; changing about:config notifies the extension.
3. Prefer Firefox’s existing **Rust static prefs** / pref observers over inventing a parallel config file.
4. Until the bridge ships, stock LibreWolf + temporary WebExt remains the supported Phase 1 path (RFP still manual).
5. Privileged experiment APIs (if used) ship **only** in the darkstr fork, not as an AMO-signed “RFP killer” on stock LibreWolf.

### XOR enforcement (fork)

When `darkstr.mode` → `pollution`:

- Set `privacy.resistFingerprinting` = `false`
- Set `privacy.fingerprintingProtection` = `false`
- Enable Rust persona path

When → `homogeneous`:

- Restore LibreWolf stock RFP/FPP expectations
- Disable persona/chaff crates

`darkstr.nativeCompatible = true` leaves mode unchanged but disables spoof/chaff surfaces (global escape). Per-site map same semantics as Phase 1 Proof pin.

---

## 5. Build / bootstrap of the LibreWolf-based fork

### Upstream

- Track LibreWolf source recipe (Codeberg `librewolf/source`) on current Firefox stable train (~155 as of Sep 2026; pin in CI).
- Consume LibreWolf patches + `librewolf.cfg` as baseline; layer **darkstr.cfg** / branding / prefs / Rust hooks on top.
- Do **not** claim to be LibreWolf; change branding (name, icon, about:license notes, user-agent brand token only where coherent with persona families — Homogeneous should still look like the LibreWolf set).

### Bootstrap steps (Builder)

1. **Linux CI builder first** (bsys6-style Docker). macOS artifacts via cross-compile from Linux (LibreWolf practice; Alex on Mac mini).
2. Clone recipe → rename product to darkstr → verify clean upstream build before any Duppel hooks.
3. Add `darkstr.cfg` prefs defaults: `darkstr.mode=homogeneous`, `darkstr.nativeCompatible=false`.
4. Vendor or path-depend `crates/` into the Firefox/LibreWolf build (workspace build + `moz.build` / `Cargo.toml` integration — exact hook TBD in first fork PR; **not** in this scaffold).
5. Thin pref observer that logs mode changes (smoke) before full necko wiring.
6. Document merge train: rebase onto LibreWolf/Firefox regularly; never freeze an old Gecko for “Rust purity.”

### Repo layout (intended)

| Path | Role |
|------|------|
| `extension/` | Phase 1+ companion WebExt (UI, bridge) |
| `crates/` | Rust control plane |
| `docs/` | Plans, Proof pins, constraints |
| `fork/` or separate private repo | LibreWolf-based tree / patches (may stay private initially) |

This Phase 2 plan PR scaffolds **docs + crates only**. Full Gecko patch tree can live in a private fork repo to keep `darkstr` public surface reviewable.

### Distribution (later Phase 4)

- Signing / notarization; update story (LibreWolf has no auto-update — decide explicitly).
- Legal: GPL-3.0 (our code) + MPL (Firefox) — counsel before binary distribution.

---

## 6. What stays in JS WebExt vs moves to Rust

| Surface | Phase 1 (now) | Phase 2 target | Notes |
|---------|---------------|----------------|-------|
| Mode / Native-Compatible UI | WebExt popup/sidebar | **Stays JS** (chrome privacy pane may duplicate) | UX remains WebExt-first |
| First-run positioning copy | WebExt | **Stays JS** | PM copy |
| Persona generation | `lib/profiles.js` | **Moves to** `duppel-persona` | JS becomes thin inspector / fallback |
| MAIN-world bootstrap inject | `executeScript` MAIN | **Moves native** (DOM/navigator) over time | WebExt inject = fallback on stock LW |
| Tab UA / CH DNR | WebExt DNR | **Moves to** necko + persona crate | Unified HTTP↔JS |
| Tracking param / GPC / Referer DNR | WebExt static ruleset | Prefer chrome prefs + channel observers | Keep DNR as belt-and-suspenders early |
| Chaff bridge + poisoner | `bridge.js` / `poisoner.js` | **Moves to** `duppel-chaff` | JS scheduler until native ready |
| RFP probe heuristic | `rfp-probe.js` | **Replaced** by fork pref auto-XOR | Probe remains for stock LibreWolf companion |
| Cookie purge UI / DNR blocklist | WebExt (Phase 1) | **Stays JS** early; optional chrome later | uBO still handles general blocking |
| Strict-first-doc | WebExt tab arm rules | **Moves to** DocShell (Phase 2→3) | Pref stays |
| Coherence / Proof harness | Manual + npm tests | **`duppel-coherence` + CI** | Release gate |
| Homogeneous RFP behavior | Stock LibreWolf | **Stays upstream LibreWolf** | Do not customize RFP metrics |

**Rule of thumb:** Rust owns **policy and identity truth**; JS owns **UI and transitional enforcement**; Gecko owns **hooks**.

---

## 7. Milestones

### M0 — Plan + stubs (this PR)

- [x] `docs/PHASE-2-PLAN.md`
- [x] Empty `crates/` workspace: persona, chaff, coherence + READMEs
- [x] `cargo test` green on stubs
- [ ] PR opened to `alex-hinojosa/darkstr`

### M1 — Fork bootstrap (4–6 weeks)

- Private LibreWolf-based tree builds on Linux CI (Docker).
- Branding: darkstr name/icons/about; Homogeneous default.
- `darkstr.cfg` ships `darkstr.mode` / `darkstr.nativeCompatible`.
- No Duppel spoof yet — prove merge train + artifact pipeline (Linux; macOS cross later).

### M2 — Pref bridge + XOR auto-RFP

- WebExt ↔ chrome pref sync for mode / nativeCompatible.
- Pollution selection auto-disables RFP/FPP; Homogeneous restores.
- Proof: mode exclusivity matrix on fork builds (no UTC letterbox under Pollution).

### M3 — First native wins (`duppel-persona`)

- Persona seed at process/startup; necko UA (+ CH policy for Firefox host: REMOVE path parity with Phase 1).
- Navigator/platform/HW surfaces from same seed (minimum coherent set).
- WebExt MAIN inject disabled when native path active (feature flag).
- `duppel-coherence` asserts HTTP↔JS on smoke sites.

### M4 — Chaff native + depth kickoff (into Phase 3)

- `duppel-chaff` scheduler behind prefs; Quiet/Balanced/Loud parity.
- Start canvas/Audio/WebGL + worker coverage; DocShell strict-next-nav.
- Native-Compatible site list UI in chrome privacy pane.
- Track D: quarterly Servo/Ladybird note only — no eng investment unless fork cost flips.

### Exit criteria for “Phase 2 done”

1. Fork builds reproducibly; Homogeneous ≈ LibreWolf RFP expectations (documented deltas only).
2. Pollution: coherent HTTP+JS persona from Rust seed; RFP contradiction impossible via prefs path.
3. Native-Compatible usable for banking/SSO without manual about:config.
4. WebExt still ships as companion UI; stock LibreWolf temporary-load path documented as **limited** (no auto-RFP).
5. Public positioning unchanged: pollution, not bypass, not official LibreWolf.

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Firefox merge-train burden | High | Automate rebase CI; minimize patch surface; crates stay out-of-tree until stable API |
| RFP + Pollution frankenstein | High | Pref XOR + auto-kill RFP; Proof exclusivity tests; Homogeneous default |
| Split-brain HTTP vs JS | High | Single persona seed; `duppel-coherence` as release gate; disable WebExt inject when native on |
| Detectable extension-only leftovers | Med | Feature-flag native path; shrink DNR/MAIN inject as hooks land |
| Branding / community conflict with LibreWolf | Med | Clear “not official”; don’t ship as LibreWolf; don’t customize RFP metrics in Homogeneous |
| GPL + MPL distribution | Med | Counsel before binaries; keep crates GPL; respect MPL for Gecko patches |
| macOS build/sign cost | Med | Linux CI first; cross-compile; notarization budget in Phase 4 |
| Scope creep into anti-detect / CF bypass | High | Non-goals enforced in README + Proof pin; refuse TLS/JA3 marketing |
| Betting on Servo/Ladybird | High if pursued | Track D only; revisit only if Gecko fork cost exceeds engine switch |
| WebExt privilege on stock LibreWolf | Med | Auto-RFP only in fork; stock path keeps manual RFP + probe |

---

## 9. Handoffs

**Builder**

- Own M1–M3 sequencing; keep Chrome Duppel / Phase 1 WebExt useful in parallel.
- Prefer crate APIs before Gecko patches; no full rewrite.
- Land fork patches in small reviewable slices (prefs → UA → DOM → chaff).

**Proof**

- Extend Phase 1 pin with fork chrome prefs; mode exclusivity; coherence crate fixtures.
- Compare: stock LibreWolf RFP vs darkstr Homogeneous vs darkstr Pollution vs Chrome Duppel.
- CreepJS / BrowserLeaks headed method remains valid; add fork artifact path when CI exists.

**Meridian**

- Naming/positioning locked to **darkstr**.
- Further research on request: Mullvad/IronFox deltas, update/signing options, Track D quarterly.

---

## 10. Success criteria (Phase 2)

1. Pollution mode: coherent HTTP+JS persona from `duppel-persona`; no RFP contradiction via prefs.
2. Homogeneous mode: bit-compatible with LibreWolf RFP expectations (or clearly documented deltas).
3. Native-Compatible: banking/SSO without manual about:config on the fork.
4. Rust crates are the source of truth for persona/chaff; Gecko is the shell; WebExt is UI/bridge.
5. Explicit public line: *pollution browser, not Cloudflare bypass, not LibreWolf official.*
6. No Servo/Ladybird ship dependency.

---

## 11. References

- Phase 1: `docs/PHASE1-CONSTRAINTS.md`, `docs/PROOF-PIN.md`, `docs/PORT-MAP.md`, repo README
- Meridian: LibreWolf × Duppel × Rust roadmap 2026-09-12
- LibreWolf: https://librewolf.net/ https://codeberg.org/librewolf/source
- Duppel (Chrome): https://github.com/alex-hinojosa/duppel
- Crates stubs: [`crates/README.md`](../crates/README.md)
