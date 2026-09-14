# Proof pin — darkstr Phase 1 (+ Phase 2 chrome-prefs panel)

**Package path (load this in LibreWolf):** `extension/`  
Repo: `https://github.com/alex-hinojosa/darkstr` → `extension/`

## Extension storage keys (authoritative)

Stored in `browser.storage.local`.

| Key | Type | Legal values | Default |
|-----|------|--------------|---------|
| `darkstr.mode` | string | `homogeneous` \| `pollution` | `homogeneous` |
| `darkstr.nativeCompatible` | boolean | `true` \| `false` | `false` |
| `darkstr.nativeCompatSites` | object | `{ [etld1]: true }` | `{}` |
| `darkstr.strictFirstDoc` | boolean | `true` \| `false` | `true` |

XOR: `darkstr.mode` is a single enum. There is no combined value. Illegal strings coerce to `homogeneous`.

`darkstr.nativeCompatible` is **independent** of mode. It does not rewrite `darkstr.mode`. Global escape: when `true`, all Pollution surfaces stay off.

`darkstr.nativeCompatSites` is a **per-site** escape map (eTLD+1 → `true`). Independent of mode and of the global bool. When Pollution is armed globally, sites in this map skip MAIN inject, tab-scoped UA DNR, and chaff. Mode stays `pollution`.

`darkstr.strictFirstDoc` is independent of XOR. When `true` (default), the first navigation for a tab stays native; a main_frame-only session DNR rule arms the **next** navigation’s HTTP UA, then MAIN inject + full tab-scoped DNR run as usual. Does not stack RFP+pollution.

Internal (not a product pin): `darkstr.firstRunDone`, `darkstr.hostPermsOk`, `darkstr.chaosLevel`, `darkstr.stats` (includes `cookiesCleaned`).

Session-scoped (dies on browser quit): `darkstr.sessionSeed`, `darkstr.profile` in `browser.storage.session`.

## Browser prefs (user-set; extension cannot write these)

### Homogeneous

| Pref | Expected |
|------|----------|
| `privacy.resistFingerprinting` | `true` (LibreWolf stock) |
| `privacy.fingerprintingProtection` | leave LibreWolf default |

### Pollution

| Pref | Expected |
|------|----------|
| `privacy.resistFingerprinting` | `false` |
| `privacy.fingerprintingProtection` | `false` |

Do not leave FPP on as a silent stack with Pollution.

### Forbidden combination (release-fail)

`darkstr.mode = pollution` **and** `privacy.resistFingerprinting = true`.

Extension heuristic: timezone `UTC` ⇒ `rfpConflict`, Pollution surfaces stay off, badge `RFP`.

## Activation matrix

| mode | nativeCompatible (global) | site in nativeCompatSites | RFP likely | persona MAIN inject / tab UA DNR / chaff |
|------|---------------------------|---------------------------|------------|------------------------------------------|
| homogeneous | * | * | * | off |
| pollution | true | * | false | off (global native escape) |
| pollution | false | yes | false | off for that site only |
| pollution | false | no | false | **on** (strict-first-doc may delay first nav) |
| pollution | * | * | true | off (`rfp_xor_pollution`) |

Static tracking ruleset follows global `pollutionActive` (mode + global native + RFP), not the per-site map.

## What ships in this Phase 1 drop

- XOR prefs + first-run + popup/sidebar with Product Manager copy
- Phase 2-aligned **chrome-prefs settings panel** (`extension/settings/`, also `options_ui`): edits `darkstr.mode` / Native-Compatible / Delay persona one page; per-site list summary; read-only chrome/`about:config` names from PREF-BRIDGE; XOR implications (Pollution→RFP/FPP off; Homogeneous→stock RFP, no metric customization); pointer to `patches/scripts/apply-darkstr-patches.sh` — **no Gecko tree required**
- Real persona generation (`lib/profiles.js`) filtered to Firefox + host OS (includes Linux)
- MAIN-world anti-fingerprint bootstrap via `scripting.executeScript({ world: "MAIN" })` (FF 128+)
- Success-driven tab-scoped User-Agent DNR; Firefox personas **REMOVE** Client Hints (A1)
- Static DNR ruleset (off until Pollution active): third-party Referer strip, Sec-GPC, tracking-param strip, **plus** slim tracker **block** list (no `ping` resource type — chaff sendBeacon guardrail; no bare `facebook.com` block)
- `bridge.js` + `poisoner.js` chaff gated to Pollution only
- Per-site Native-Compatible map (`darkstr.nativeCompatSites`) with popup add-current / list / remove
- Strict-first-document / next-nav coherence (`darkstr.strictFirstDoc`, default on)
- Tracker-cookie purge UI (`cookies` API + `lib/tracker-cookies.js`): Domain-list match only; popup **Purge tracker cookies**; 15‑min alarm when host access granted. Honest wording — **not** cookie containers

## Deferred / residuals (still not a Proof fail for this PR)

- Cookie-jar browser UI / per-site cookie allowlist / selective keep
- Chromium Client Hints SET (Firefox host never selects Chromium personas)
- Full uBO-parity blocklist (LibreWolf still ships uBO; ours is a slim Pollution companion)
- LibreWolf fork bootstrap (M1+); crate APIs exist under `crates/` (no Gecko FFI yet)
- WebExt ↔ chrome pref bridge wiring (design: `docs/PREF-BRIDGE.md`; UI mirror panel ships; chrome write is fork M2)

## How to read the pin

1. Toolbar badge: `H` = homogeneous, `P` = pollution selected, `RFP` = conflict.
2. Popup footer prints `darkstr.mode=… · darkstr.nativeCompatible=… · sites=N · strictFirstDoc=…`.
2b. **Chrome-prefs panel** (toolbar → Open chrome-prefs panel, or extension Options): same semantic prefs; XOR implications box; read-only chrome key table; fork apply script note. Quiet/Balanced/Loud remain on the toolbar popup when Pollution is armed.
3. With Pollution armed and RFP off, popup shows Current persona (UA / platform / screen / GPU / TZ).
4. Native-Compatible section: global checkbox + **This site** (eTLD+1) + list with Remove.
5. Tracker cookies section: **Purge tracker cookies** + Domain-list-only hint (no containering).
6. `about:debugging` → Inspect darkstr → Storage → Extension storage / Session storage (`darkstr.stats.cookiesCleaned`).
7. `about:config` for the two `privacy.*` prefs above.
8. Optional: CreepJS / BrowserLeaks on a Pollution profile — expect coherent Firefox-family persona, not stock RFP UTC letterbox. With strict-first-doc on, expect native on first nav of a tab, persona after next nav.

## How Proof should re-test

1. Temporary-load `extension/` on LibreWolf (dedicated profile).
2. Homogeneous: leave RFP on → badge `H`, no persona panel, DNR ruleset disabled.
3. Pollution without turning RFP off → badge `RFP`, persona/chaff gated.
4. Pollution with RFP+FPP false → badge `P`, persona shown. With **strictFirstDoc** on: first https nav stays native; second nav gets MAIN inject + tab UA. Sec-GPC / utm strip **and** slim tracker blocks active when Pollution armed; chaff `sendBeacon` still accepted (DNR omits `ping`; no `facebook.com` host block).
5. Toggle global Native-Compatible on while Pollution selected → surfaces off, mode stays `pollution`.
6. Add current site via **This site** Native-Compatible → that eTLD+1 skips persona/chaff; other sites still polluted; mode stays `pollution`. Remove from list → surfaces return.
7. Toggle strict-first-doc off → inject on first committed nav (success-driven path without arm delay).
8. Rotate identity → new UA in panel, tabs reload.
9. Quiet / Balanced / Loud labels and PM copy unchanged.
9b. Open chrome-prefs panel: mode radios + Native-Compatible + Delay persona one page match popup; XOR box shows Pollution→RFP/FPP off vs Homogeneous→stock RFP / no metric customization; chrome key table lists `darkstr.*` names; patches apply pointer present; copy stays pollution framing (not Cloudflare bypass / not official LibreWolf).
10. Tracker cookies: with site access, **Purge tracker cookies** removes Domain-matched known-tracker cookies only; counter bumps `cookiesCleaned`. Without site access → honest error hint. Wording must not claim containers.
11. `npm test` for XOR + profile seed determinism + eTLD+1 / sites prefs + tracker-cookie filter + DNR chaff guardrail.


## Phase 2 M1 skim note (prefs/cfg only — 2026-09-14)

Chrome key names above remain the pin. M1 first drop on the private LibreWolf-based tree is **defaults only**:

- `defaultPref("darkstr.mode", "homogeneous")`
- `defaultPref("darkstr.nativeCompatible", false)`
- `defaultPref("darkstr.strictFirstDoc", true)`

Installed via `patches/scripts/apply-darkstr-patches.sh` into `lw/darkstr.cfg` + marked append on `lw/librewolf.cfg`. **No** Pollution auto-RFP yet (M2). **No** claim that a rebuilt browser binary exists until Linux CI / local build artifacts are Proof-checked. See `docs/M1-STATUS.md`.

## Phase 2 M2 note (XOR applicator control plane — 2026-09-14)

Chrome key names and the activation matrix above remain the pin. M2 first drop is the **Rust prefs-path applicator** (not a claim that live Gecko C++ observers exist yet):

| Mode | Applicator writes | Crates |
|------|-------------------|--------|
| Pollution | `privacy.resistFingerprinting=false`, `privacy.fingerprintingProtection=false` | enable unless `darkstr.nativeCompatible` |
| Homogeneous | stock RFP true / FPP stock-on restore | idle; **no** RFP metric customization |

**Forbidden via prefs path:** Pollution with RFP still true. Enforced in `duppel_bridge::PrefApplyPlan::is_xor_safe` after `PrefsApplicator::apply_mode_effects`.

See `docs/M2-STATUS.md`, `docs/GECKO-HOOKS.md` §1.2–1.3, stub `patches/stubs/0002-darkstr-mode-xor-rfp.patch.stub`. Stock LibreWolf companion still cannot auto-kill RFP (manual about:config + UTC probe).
