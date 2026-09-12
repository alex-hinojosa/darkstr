# darkstr

LibreWolf-based **pollution** brand. Phase 1 is a Firefox WebExtension that runs on **stock LibreWolf** with Resist Fingerprinting **off** in Pollution mode.

darkstr makes trackers’ data worse and less linkable.

It is **not** an anti-detect browser.  
It is **not** a Cloudflare bypass.  
It is **not** official LibreWolf.

We are **not** rewriting LibreWolf in Rust in Phase 1.

Chrome Duppel stays at https://github.com/alex-hinojosa/duppel. This tree is the Firefox companion + future fork home.

## Modes (XOR)

| Mode | What happens |
|------|----------------|
| **Homogeneous** | Stock LibreWolf RFP. You look like other LibreWolf users. darkstr does not apply a Duppel persona. |
| **Pollution** | Duppel persona path. RFP **must** be off. Stacking RFP + Pollution is refused. |

**Native-Compatible** is independent (`darkstr.nativeCompatible` bool). It restores native identity for banking / SSO without changing the mode enum. It is not a Cloudflare-defeat switch.

Provisional prefs (extension storage, Proof pin):

- `darkstr.mode` = `homogeneous` \| `pollution`
- `darkstr.nativeCompatible` = `bool`

See [docs/PROOF-PIN.md](docs/PROOF-PIN.md).

## This Phase 1 drop

Scaffold only:

- Firefox MV3 manifest (event page, gecko id, sidebar — not Chrome `sidePanel`)
- XOR mode engine + first-run copy
- Slim DNR tracking-param / GPC ruleset, enabled only when Pollution is actually active
- Popup + Proof-readable pref line
- Research: [docs/PHASE1-CONSTRAINTS.md](docs/PHASE1-CONSTRAINTS.md)
- Port vs defer: [docs/PORT-MAP.md](docs/PORT-MAP.md)

**Not in this drop:** Duppel MAIN-world bootstrap, `profiles.js` rotation, `poisoner.js` chaff, per-site Native-Compatible map, Rust crates, a LibreWolf fork.

## Install on LibreWolf (temporary add-on)

Unsigned permanent install is blocked on release-class LibreWolf. Phase 1 uses the temporary load path. It lasts until the browser restarts.

1. Install current LibreWolf. Use a **dedicated profile** for darkstr (RFP changes are profile-wide).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **This Firefox** if needed, then **Load Temporary Add-on**.
4. Select [`extension/manifest.json`](extension/manifest.json) in this repo.
5. First-run opens. Read the positioning. Pick **Homogeneous** or **Pollution**. Grant site access if you want Pollution surfaces.

To reload after code changes: `about:debugging` → **Reload** on darkstr.

## Pollution: turn RFP off

LibreWolf ships `privacy.resistFingerprinting = true`. Pollution cannot stack with it.

1. `about:config`
2. `privacy.resistFingerprinting` → **false**
3. `privacy.fingerprintingProtection` → **false**
4. Restart LibreWolf, then reload the temporary add-on.

Do not “customize RFP metrics.” That hurts LibreWolf’s anonymity set and still fights the persona. Turn RFP **off**, then use Pollution.

Homogeneous: leave RFP on (LibreWolf default).

## Proof

Package path: **`extension/`** (this directory on disk: `/workspace/darkstr-phase1/extension/`).

Expected keys: `darkstr.mode`, `darkstr.nativeCompatible`.  
Expected browser prefs and the forbidden combo: [docs/PROOF-PIN.md](docs/PROOF-PIN.md).

```bash
npm test
```

## Layout

```
extension/                 load this in LibreWolf
  manifest.json            Firefox MV3
  background.js            event page — prefs, XOR, DNR gate
  first-run.html           PM positioning + mode pick
  lib/prefs.js             darkstr.mode / darkstr.nativeCompatible
  lib/modes.js             XOR + activation matrix
  lib/rfp-probe.js         UTC-timezone heuristic
  popup/                   toolbar + sidebar panel
  rules/tracking.json      slim DNR (off until Pollution is active)
docs/
  PHASE1-CONSTRAINTS.md
  PORT-MAP.md
  PROOF-PIN.md
tests/xor.test.mjs
```

## License

GPL-3.0-only (same as Duppel).
