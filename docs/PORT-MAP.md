# Duppel → darkstr port map

Source of truth: https://github.com/alex-hinojosa/duppel (`main`; A1 Client Hints in PR #2).

Chrome surfaces today: `background.js`, `bridge.js`, `anti-fingerprint-bootstrap.js`, `poisoner.js`, `profiles.js`, `rules/tracking.json`, `popup/`.

## Phase 1 — Firefox WebExtension on stock LibreWolf (RFP off in Pollution)

| Duppel surface | Phase 1 | Status |
|----------------|---------|--------|
| `manifest.json` | Firefox event page, gecko id, `sidebar_action`, `strict_min_version` 128 | **Shipped** |
| Mode / first-run / XOR prefs | `darkstr.mode`, `darkstr.nativeCompatible` | **Shipped** |
| Native-Compatible global | Global bool | **Shipped** |
| Per-site Native-Compatible | `darkstr.nativeCompatSites` + eTLD+1 (`lib/sites.js`); honor in inject/chaff/`checkSiteOverride`; popup add-current / list / remove | **Shipped** |
| Strict-next-nav / first-doc | `darkstr.strictFirstDoc` (default true); per-tab main_frame arm rules; no XOR change | **Shipped** |
| `profiles.js` | Firefox-host filter + Linux Firefox family | **Shipped** |
| MAIN-world bootstrap | `executeScript({ world: "MAIN" })` from built `anti-fingerprint-bootstrap.js` | **Shipped** |
| `bridge.js` | ISOLATED content script; chaff queue | **Shipped** (pollution-gated; per-site aware) |
| `poisoner.js` + alarms | Chaff scheduler | **Shipped** (pollution-gated) |
| `rules/tracking.json` | GPC + tracking-param strip + 3p Referer strip; no Chrome blocklist / no static CH strip | **Shipped** |
| Tab-scoped UA DNR | Success-driven after MAIN inject; Firefox personas REMOVE CH (A1) | **Shipped** |
| Popup / sidebar | Mode radios + Native-Compatible (global + per-site) + strict-next-nav + persona + Quiet/Balanced/Loud | **Shipped** |
| `cookies` clean | — | **Deferred** |
| Client Hints SET (Chromium) | N/A on Firefox host; REMOVE path shipped | **Depends on host** |
| Playwright / CreepJS matrix | LibreWolf-headed | **Proof** |

## Phase 2 — Rust crates + LibreWolf-based fork (not this drop)

Unchanged from prior scaffold: `duppel-persona`, `duppel-chaff`, `duppel-coherence`, necko UA, in-engine canvas/WebGL, DocShell strict-nav, auto-RFP-off, fork distribution.

## Explicit non-ports

- TLS / JA3 spoof marketing
- “Beats Cloudflare / Turnstile”
- Anti-detect multi-account browser lane
- Claiming to be official LibreWolf
- Rewriting LibreWolf in Rust
