# Proof pin — darkstr Phase 1

**Package path (load this in LibreWolf):** `extension/`  
Repo: `https://github.com/alex-hinojosa/darkstr` → `extension/`

## Extension storage keys (authoritative)

Stored in `browser.storage.local`.

| Key | Type | Legal values | Default |
|-----|------|--------------|---------|
| `darkstr.mode` | string | `homogeneous` \| `pollution` | `homogeneous` |
| `darkstr.nativeCompatible` | boolean | `true` \| `false` | `false` |

XOR: `darkstr.mode` is a single enum. There is no combined value. Illegal strings coerce to `homogeneous`.

`darkstr.nativeCompatible` is **independent** of mode. It does not rewrite `darkstr.mode`.

Internal (not a product pin): `darkstr.firstRunDone`, `darkstr.hostPermsOk`, `darkstr.chaosLevel`, `darkstr.stats`.

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

| mode | nativeCompatible | RFP likely | persona MAIN inject / tab UA DNR / tracking rules / chaff |
|------|------------------|------------|-----------------------------------------------------------|
| homogeneous | * | * | off |
| pollution | false | false | **on** |
| pollution | true | false | off (native escape) |
| pollution | * | true | off (`rfp_xor_pollution`) |

## What ships in this Phase 1 drop

- XOR prefs + first-run + popup/sidebar with Product Manager copy
- Real persona generation (`lib/profiles.js`) filtered to Firefox + host OS (includes Linux)
- MAIN-world anti-fingerprint bootstrap via `scripting.executeScript({ world: "MAIN" })` (FF 128+)
- Success-driven tab-scoped User-Agent DNR; Firefox personas **REMOVE** Client Hints (A1)
- Static DNR ruleset (off until Pollution active): third-party Referer strip, Sec-GPC, tracking-param strip
- `bridge.js` + `poisoner.js` chaff gated to Pollution only

## Deferred (still not a Proof fail for this PR)

- Per-site Native-Compatible map (`nativeCompatSites`)
- Strict-first-document / success-driven full Duppel DNR lifecycle parity
- Cookie clean UI
- Chromium Client Hints SET (Firefox host never selects Chromium personas)
- Tracker blocklist (LibreWolf ships uBO)
- Rust crates / LibreWolf fork

## How to read the pin

1. Toolbar badge: `H` = homogeneous, `P` = pollution selected, `RFP` = conflict.
2. Popup footer prints `darkstr.mode=… · darkstr.nativeCompatible=…`.
3. With Pollution armed and RFP off, popup shows Current persona (UA / platform / screen / GPU / TZ).
4. `about:debugging` → Inspect darkstr → Storage → Extension storage / Session storage.
5. `about:config` for the two `privacy.*` prefs above.
6. Optional: CreepJS / BrowserLeaks on a Pollution profile — expect coherent Firefox-family persona, not stock RFP UTC letterbox.

## How Proof should re-test

1. Temporary-load `extension/` on LibreWolf (dedicated profile).
2. Homogeneous: leave RFP on → badge `H`, no persona panel, DNR ruleset disabled.
3. Pollution without turning RFP off → badge `RFP`, persona/chaff gated.
4. Pollution with RFP+FPP false → badge `P`, persona shown, MAIN inject on https navigation, Sec-GPC / utm strip active, chaff queue works on interaction.
5. Toggle Native-Compatible on while Pollution selected → surfaces off, mode stays `pollution`.
6. Rotate identity → new UA in panel, tabs reload.
7. `npm test` for XOR + profile seed determinism.
