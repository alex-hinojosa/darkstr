# darkstr

LibreWolf-based **pollution** brand. Phase 1 is a Firefox WebExtension that runs on **stock LibreWolf** with Resist Fingerprinting **off** in Pollution mode.

darkstr makes trackers’ data worse and less linkable.

It is **not** an anti-detect browser.  
It is **not** a Cloudflare bypass.  
It is **not** official LibreWolf.

We are **not** rewriting LibreWolf in Rust in Phase 1.
Phase 2: private LibreWolf-based fork + Rust crates behind prefs — see [docs/PHASE-2-PLAN.md](docs/PHASE-2-PLAN.md).
Servo/Ladybird = research-only Track D.

Chrome Duppel stays at https://github.com/alex-hinojosa/duppel. This tree is the Firefox companion + future fork home.

## Modes (XOR)

| Mode | What happens |
|------|----------------|
| **Homogeneous** | Stock LibreWolf RFP. You look like other LibreWolf users. darkstr does not apply a Duppel persona. |
| **Pollution** | Duppel persona path (MAIN-world bootstrap + chaff + slim DNR). RFP **must** be off. Stacking RFP + Pollution is refused. |

**Native-Compatible** is independent of mode:

- Global: `darkstr.nativeCompatible` bool — restores native identity for banking / SSO without changing the mode enum. Not a Cloudflare-defeat switch.
- Per-site: `darkstr.nativeCompatSites` map (eTLD+1) — same escape for individual sites while Pollution stays selected elsewhere.

**Strict first-document** (`darkstr.strictFirstDoc`, default on): first nav stays native; next nav gets persona UA on main_frame then MAIN inject. Independent of XOR.

Provisional prefs (extension storage, Proof pin):

- `darkstr.mode` = `homogeneous` \| `pollution`
- `darkstr.nativeCompatible` = `bool`
- `darkstr.nativeCompatSites` = `{ [etld1]: true }`
- `darkstr.strictFirstDoc` = `bool` (default `true`)

See [docs/PROOF-PIN.md](docs/PROOF-PIN.md).

## What ships now

- Firefox MV3 event page (gecko id, sidebar — not Chrome `sidePanel`)
- XOR mode engine + first-run copy
- Real persona generation (`extension/lib/profiles.js`), Firefox + host-OS filtered (Linux included)
- MAIN-world anti-fingerprint bootstrap via `scripting.executeScript({ world: "MAIN" })` (Firefox 128+)
- `bridge.js` + `poisoner.js` chaff **only** when Pollution is actually active
- Slim DNR: Sec-GPC, tracking-param strip, third-party Referer strip, plus a chaff-safe tracker **block** list — enabled only when Pollution is active
- Success-driven tab-scoped User-Agent DNR; Firefox personas **REMOVE** Client Hints (aligns with Duppel A1)
- Popup/sidebar: mode radios, Native-Compatible (global + per-site list), strict next-nav, persona inspector, Quiet/Balanced/Loud chaff, tracker-cookie purge
- Settings / chrome-prefs panel (`extension/settings/`, Options page): same prefs + XOR implications + PREF-BRIDGE key names + patches apply pointer (no Gecko tree)
- Per-site Native-Compatible map + strict-first-document / next-nav coherence
- Tracker-cookie purge (Firefox `cookies` API): Domain-list match only — **not** cookie containers

**Still deferred / residuals:** cookie-jar UI / per-site cookie allowlist; full uBO-parity blocklist (LibreWolf still ships uBO); LibreWolf fork bootstrap (M1). Rust control-plane crates are past stubs — see [`crates/`](crates/) and [`docs/PREF-BRIDGE.md`](docs/PREF-BRIDGE.md).

## Install on LibreWolf (temporary add-on)

Unsigned permanent install is blocked on release-class LibreWolf. Phase 1 uses the temporary load path. It lasts until the browser restarts.

1. Install current LibreWolf. Use a **dedicated profile** for darkstr (RFP changes are profile-wide).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **This Firefox** if needed, then **Load Temporary Add-on**.
4. Select [`extension/manifest.json`](extension/manifest.json) in this repo.
5. First-run opens. Read the positioning. Pick **Homogeneous** or **Pollution**. Grant site access if you want Pollution surfaces.

To reload after code changes: `about:debugging` → **Reload** on darkstr.

Rebuild the MAIN-world bundle after editing `extension/src/content/anti-fingerprint/*`:

```bash
npm run build
```

## Pollution: turn RFP off

LibreWolf ships `privacy.resistFingerprinting = true`. Pollution cannot stack with it.

1. `about:config`
2. `privacy.resistFingerprinting` → **false**
3. `privacy.fingerprintingProtection` → **false**
4. Restart LibreWolf, then reload the temporary add-on.

Do not “customize RFP metrics.” That hurts LibreWolf’s anonymity set and still fights the persona. Turn RFP **off**, then use Pollution.

Homogeneous: leave RFP on (LibreWolf default).

## Proof

Package path: **`extension/`**

Expected keys: `darkstr.mode`, `darkstr.nativeCompatible`, `darkstr.nativeCompatSites`, `darkstr.strictFirstDoc`.  
Expected browser prefs and the forbidden combo: [docs/PROOF-PIN.md](docs/PROOF-PIN.md).

```bash
npm test
npm run build
cd crates && cargo test
```

CI on push/PR to `main` runs the same `npm test` and `cd crates && cargo test` jobs (GitHub Actions). Contribution norms (small PRs, Proof XOR gate, no RFP+Pollution stack, PM copy for UI, don’t retag casually): [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

```
extension/                 load this in LibreWolf
  manifest.json            Firefox MV3
  background.js            event page — prefs, XOR, persona, DNR, chaff
  anti-fingerprint-bootstrap.js   @generated MAIN-world inject target
  bridge.js                ISOLATED chaff bridge
  poisoner.js              chaff configs
  first-run.html           PM positioning + mode pick
  lib/prefs.js             darkstr.mode / darkstr.nativeCompatible
  lib/modes.js             XOR + activation matrix
  lib/profiles.js          persona generation (Duppel-aligned)
  lib/rfp-probe.js         UTC-timezone heuristic
  popup/                   toolbar + sidebar panel
  settings/                chrome-prefs panel (options_ui)
  rules/tracking.json      slim DNR + chaff-safe tracker blocks (off until Pollution)
  lib/tracker-cookies.js   known-tracker Domain list + purge helpers
  src/content/anti-fingerprint/   bootstrap source (esbuild)
docs/
  PHASE1-CONSTRAINTS.md
  PHASE-2-PLAN.md          Phase 2 fork + Rust plan
  PREF-BRIDGE.md           WebExt ↔ chrome prefs
  GECKO-HOOKS.md           nsHttp / DocShell / canvas call-ins
  PORT-MAP.md
  PROOF-PIN.md
  PROOF-XOR-CHECKLIST.md
crates/                    Phase 2 Rust control plane (+ duppel-bridge)
patches/                   Thin LibreWolf apply stubs (no browser vendor)
tests/
esbuild.config.mjs
CONTRIBUTING.md
.github/workflows/         CI (npm test + cargo test)
```

## License

GPL-3.0-only (same as Duppel).
