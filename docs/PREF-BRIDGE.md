# Pref bridge — WebExt ↔ chrome (Phase 2 design)

**Status:** First WebExt ↔ chrome Proof-pin sync slice shipped (Phase 2). Fork / temporary-load with `experiment_apis.darkstrPrefs`; chrome authoritative. Stock LibreWolf companion without experiments remains storage-only.  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Honesty:** This PR does **not** flip hooks default-on, does **not** write `privacy.*` from WebExt, does **not** claim live Mini Proof XOR until Proof runs it, and is **not** an AMO path that mutates RFP/FPP on stock Firefox.

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
| `darkstr.nativePersonaHooks` | bool | `true` \| `false` | `false` (default-off) | storage | chrome bool; WebExt MAIN inject gate |

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
4. Stock LibreWolf companion **without** experiments: storage-only Phase 1 path (RFP still **manual**). Fork / temporary-load with `darkstrPrefs`: chrome authoritative via §8 bridge.
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
| WebExt mirror sync | Builder (Phase 2) | **Shipped (first slice):** `extension/experiments/darkstr_prefs` + `lib/pref-bridge.js` — Proof-pin keys only; chrome authoritative on fork; stock = soft no-op |
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
- WebExt Settings writes `browser.storage.local`; on the fork (or temporary-load with experiments), `pref-bridge` pushes Proof-pin keys to `about:config` and pulls chrome → storage on startup (chrome authoritative). Stock companion without experiments stays storage-only — keep keys aligned manually there for Mini smoke if needed.
- **Default:** hooks remain **off**. Bridge never coerces `darkstr.nativePersonaHooks` to true.


---

## 8. Implementation (first sync slice — this PR)

| Piece | Path | Role |
|-------|------|------|
| WebExtension Experiment | `extension/experiments/darkstr_prefs/` (`schema.json`, `api.js`) | Parent `Services.prefs` get/set for Proof-pin keys; `onChanged` observer |
| Manifest | `extension/manifest.json` → `experiment_apis.darkstrPrefs` | Loaded when experiments are allowed (fork / temporary-load). Absent API → storage-only |
| Bridge glue | `extension/lib/pref-bridge.js` | Detect API; startup pull chrome→storage; `savePrefs` push storage→chrome; echo guard |
| Background | `extension/background.js` | `initPrefBridge` on boot; `pushPrefsToChrome` after storage writes |

### Proof XOR suggested steps (manual on Mini fork build)

1. Temporary-load or ship the extension on a darkstr fork build where `experiment_apis` work.
2. Open Settings → flip `darkstr.mode` Homogeneous ↔ Pollution → confirm `about:config` `darkstr.mode` matches.
3. Toggle Native-Compatible / Delay persona one page / Native persona hooks (leave hooks **off** unless intentionally testing) → matching `darkstr.*` chrome prefs.
4. In `about:config`, change `darkstr.mode` → reload extension UI / wait for observer → storage mirror and Settings radios match (bidirectional).
5. Confirm `privacy.resistFingerprinting` / `privacy.fingerprintingProtection` are **not** written by the extension (ModeXor / `0002` owns that on the fork).

### Explicit non-claims

- No live Mini Proof XOR result claimed in this PR.
- No hooks default-on / no product flip.
- No AMO-signed stock path that writes `privacy.*`.
- No RFP metric customization.
- Stock LibreWolf companion without experiments: still storage-only (honest soft no-op).

## 6d. Cookie firewall (0035 — Phase 5)

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| `darkstr.cookieFirewall.enabled` | bool | `false` | Explicit second arm; idle unless Pollution+hooks too |
| `darkstr.cookieFirewall.mode` | string | `synthetic` | `synthetic` \| `isolate` |
| `darkstr.cookieFirewall.allowlist` | string | `""` | CSV eTLD+1 real-jar passthrough |

Diagnostics: `darkstr.cookieFirewall.armed`, `lastEtld`, `lastSeed`, `lastDecision`, `lastInstall`.  
Design: [`COOKIE-SANDBOX-FAKE-JAR.md`](COOKIE-SANDBOX-FAKE-JAR.md). Status: [`PHASE-5-STATUS.md`](PHASE-5-STATUS.md).
