# Proof pin — darkstr Phase 1

**Package path (load this in LibreWolf):** `/workspace/darkstr-phase1/extension/`

If this tree is pushed: `https://github.com/alex-hinojosa/darkstr` → `extension/`.

## Extension storage keys (authoritative)

Stored in `browser.storage.local`.

| Key | Type | Legal values | Default |
|-----|------|--------------|---------|
| `darkstr.mode` | string | `homogeneous` \| `pollution` | `homogeneous` |
| `darkstr.nativeCompatible` | boolean | `true` \| `false` | `false` |

XOR: `darkstr.mode` is a single enum. There is no combined value. Illegal strings coerce to `homogeneous`.

`darkstr.nativeCompatible` is **independent** of mode. It does not rewrite `darkstr.mode`.

Internal (not a product pin): `darkstr.firstRunDone`, `darkstr.hostPermsOk`.

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

| mode | nativeCompatible | RFP likely | persona / DNR / chaff |
|------|------------------|------------|------------------------|
| homogeneous | * | * | off |
| pollution | false | false | on (Phase 1: DNR stub only; persona inject gated, not shipped) |
| pollution | true | false | off (native escape) |
| pollution | * | true | off (`rfp_xor_pollution`) |

## How to read the pin

1. Toolbar badge: `H` = homogeneous, `P` = pollution armed, `RFP` = conflict.
2. Popup footer prints `darkstr.mode=… · darkstr.nativeCompatible=…`.
3. `about:debugging` → Inspect darkstr → Storage → Extension storage.
4. `about:config` for the two `privacy.*` prefs above.
