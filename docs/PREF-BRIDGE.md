# Pref bridge — WebExt ↔ chrome (Phase 2 design)

**Status:** Design locked for M2 wiring. No Gecko patch in this PR.  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

Phase 1 stores product prefs in `browser.storage.local`. The LibreWolf-based fork makes **chrome prefs authoritative** under the **same key names**. This document is the bridge contract for Builder + Proof.

See also: [`PHASE-2-PLAN.md`](PHASE-2-PLAN.md) §2–§4, [`PROOF-PIN.md`](PROOF-PIN.md), [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md), Rust constants in `duppel_persona::prefs`.

---

## 1. Stable pref names (Phase 1 storage → Phase 2 about:config)

| Key | Type | Legal values | Default | Phase 1 today | Phase 2 chrome |
|-----|------|--------------|---------|---------------|----------------|
| `darkstr.mode` | string | `homogeneous` \| `pollution` | `homogeneous` | `browser.storage.local` | `about:config` / `darkstr.cfg` |
| `darkstr.nativeCompatible` | bool | `true` \| `false` | `false` | storage | chrome bool |
| `darkstr.nativeCompatSites` | JSON object | `{ [etld1]: true }` | `{}` | storage | chrome JSON pref or profile file + WebExt mirror |
| `darkstr.strictFirstDoc` | bool | `true` \| `false` | `true` | storage | chrome bool; later DocShell |

**Do not** introduce `duppel.pollution.enabled`. darkstr brand wins — Proof pin stays on `darkstr.*`.

Illegal `darkstr.mode` strings coerce to `homogeneous` (safe default; does not fight stock RFP).

Internal / may stay storage longer: `darkstr.chaosLevel`, session seed/profile, first-run flags.

---

## 2. Authority and sync

```
WebExt UI (popup / sidebar / first-run / settings chrome-prefs panel)
        │  write / read mirror
        ▼
browser.storage.local  ←→  bridge  ←→  chrome prefs (authoritative in fork)
                                              │
                                              ├─ pref observers
                                              ▼
                                    Rust crates (duppel-*)
                                              │
                                              ▼
                                    Gecko hooks (later milestones)
```

1. **In the fork build:** chrome prefs are authoritative. WebExt storage is a cache/UI mirror.
2. Sync is **bidirectional during transition:** popup mode change writes chrome pref; `about:config` change notifies the extension (experimental API or native messaging — fork-only).
3. Prefer Firefox **Rust static prefs** / pref observers over a parallel config file.
4. Until the bridge ships: stock LibreWolf + temporary WebExt remains the supported Phase 1 path (RFP still **manual**).
5. Privileged “RFP killer” APIs ship **only** in the darkstr fork — never as an AMO-signed extension on stock LibreWolf.

Example defaults: [`darkstr.cfg.example`](darkstr.cfg.example).

---

## 3. Pollution auto-kills RFP / FPP

When `darkstr.mode` becomes `pollution`, the fork **must**:

| Pref | Set to |
|------|--------|
| `privacy.resistFingerprinting` | `false` |
| `privacy.fingerprintingProtection` | `false` |

Then enable the Rust persona / chaff path (crates no longer idle), subject to Native-Compatible.

**Forbidden (release-fail):** `darkstr.mode = pollution` with `privacy.resistFingerprinting = true`.

Phase 1 cannot write these prefs (extension limitation); it only probes (UTC heuristic → `rfpConflict`) and gates surfaces. Phase 2 replaces that heuristic with pref auto-XOR on fork builds. The probe remains for the stock-LibreWolf companion path.

Rust mirror: `duppel_persona::mode_pref_effects(Mode::Pollution, …)`.

---

## 4. Homogeneous restores stock RFP (no metric customization)

When `darkstr.mode` becomes `homogeneous`, the fork **must**:

| Pref | Set to |
|------|--------|
| `privacy.resistFingerprinting` | `true` (LibreWolf stock expectation) |
| `privacy.fingerprintingProtection` | restore LibreWolf stock / default path |

- **Disable** persona and chaff crates (`crates_idle = true`).
- **Do not** customize RFP metrics, letterboxing tables, or spoof RFP surfaces.
- Homogeneous should remain in the LibreWolf anonymity set (documented deltas only).

Customizing RFP “a little” while claiming Homogeneous is a Proof fail and a branding conflict with LibreWolf.

Rust mirror: `duppel_persona::mode_pref_effects(Mode::Homogeneous, …)`.

---

## 5. Native-Compatible (not a third XOR arm)

`darkstr.nativeCompatible = true`:

- Leaves `darkstr.mode` unchanged.
- Disables spoof / chaff surfaces (global escape) while Pollution may still be selected.
- Per-site map (`darkstr.nativeCompatSites`) same semantics as Phase 1 Proof pin.

Native-Compatible is for banking / SSO — **not** a Cloudflare-defeat switch.

---

## 6. Bridge implementation sketch (M2)

| Step | Owner | Notes |
|------|-------|-------|
| Ship `darkstr.cfg` defaults | Builder (M1) | Homogeneous + nativeCompatible=false — **done** (#14) |
| XOR applicator table + unit tests | Builder (M2) | `mode_pref_effects` + `PrefsApplicator` + `is_xor_safe` — **done** (control plane) |
| Static prefs / live C++ observers for `darkstr.*` | Builder (M2+) | Private fork; call `apply_mode_effects` — **not claimed** in public M2 |
| On Pollution: force RFP/FPP false | Builder (M2) | Single Rust prefs path; Proof exclusivity matrix |
| On Homogeneous: restore stock RFP/FPP | Builder (M2) | No metric patches |
| WebExt mirror sync | Builder (M2+) | storage ↔ chrome; fork-only privileged API — deferred |
| Disable WebExt MAIN inject when native path on | Builder (M3) | Pref name `darkstr.nativePersonaHooks` + `WebExtMainInjectPolicy` encoded; live flip after fork Proof |
| Gecko call sites (nsHttp / DocShell / canvas) | Builder (M3+) | [`GECKO-HOOKS.md`](GECKO-HOOKS.md); stubs in [`../patches/`](../patches/) |
| `PrefsApplicator` XPCOM adapter | Builder (M2+) | Trait + recording mock landed; XPCOM glue still fork |

---


## 6b. Settings / chrome-prefs panel (WebExt, no Gecko tree)

Phase 2-aligned UI lives at `extension/settings/` (also Firefox `options_ui`). It:

- Shows/edits the same semantic prefs as the popup (`darkstr.mode` XOR radios, Native-Compatible, Delay persona one page / `strictFirstDoc`, per-site list summary).
- Surfaces XOR implications in copy: Pollution → RFP/FPP must be off; Homogeneous → stock RFP; **no metric customization**.
- Lists chrome / `about:config` key names from this document (read-only education for Proof + PM).
- Points at `patches/scripts/apply-darkstr-patches.sh` for fork builds.

It does **not** write `privacy.*` on stock LibreWolf. Chrome authority + live observers remain fork M2+; public M2 ships the Rust XOR applicator only ([`M2-STATUS.md`](M2-STATUS.md)).

## 7. Proof hooks

Use [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md) on every prefs / Gecko wiring PR.  
Crate fixtures: `duppel_coherence::xor_matrix`, `assert_pollution_kills_rfp`, `assert_homogeneous_stock_rfp`.


## 6c. Native persona hooks (PM Settings copy — 2026-09-15)

- **Label:** Native persona hooks
- **Help:** When on, the darkstr fork applies persona in the browser (not only the extension). Pollution mode only. RFP must stay off. Not anti-detect. Not a Cloudflare bypass.
- **Default:** Off
- **First-run (Pollution path):** “On the darkstr fork you can turn on Native persona hooks in Settings after RFP is off.”
- WebExt Settings writes `browser.storage.local`; fork chrome/C++ SoT remains `about:config` until §6 sync bridge ships — keep keys aligned manually for Mini smoke.
