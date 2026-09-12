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
WebExt UI (popup / sidebar / first-run)
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

## 6. Bridge implementation sketch (M2 — not this PR)

| Step | Owner | Notes |
|------|-------|-------|
| Ship `darkstr.cfg` defaults | Builder (M1) | Homogeneous + nativeCompatible=false |
| Static prefs / observers for `darkstr.*` | Builder (M2) | Log mode changes before full necko wiring |
| On Pollution: force RFP/FPP false | Builder (M2) | Single code path; Proof exclusivity matrix |
| On Homogeneous: restore stock RFP/FPP | Builder (M2) | No metric patches |
| WebExt mirror sync | Builder (M2) | storage ↔ chrome; fork-only privileged API |
| Disable WebExt MAIN inject when native path on | Builder (M3+) | Feature flag |
| Gecko call sites (nsHttp / DocShell / canvas) | Builder (M3+) | [`GECKO-HOOKS.md`](GECKO-HOOKS.md); stubs in [`../patches/`](../patches/) |
| `PrefsApplicator` XPCOM adapter | Builder (M2+) | `duppel_bridge` trait; recording mock for CI |

---

## 7. Proof hooks

Use [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md) on every prefs / Gecko wiring PR.  
Crate fixtures: `duppel_coherence::xor_matrix`, `assert_pollution_kills_rfp`, `assert_homogeneous_stock_rfp`.
