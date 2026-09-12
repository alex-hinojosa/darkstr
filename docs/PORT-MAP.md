# Duppel → darkstr port map

Source of truth: https://github.com/alex-hinojosa/duppel (`main` after Sprint 0; A1 may be in PR #2).

Chrome surfaces today: `background.js`, `bridge.js`, `anti-fingerprint-bootstrap.js`, `poisoner.js`, `profiles.js`, `rules/tracking.json`, `popup/`.

## Phase 1 — Firefox WebExtension on stock LibreWolf (RFP off in Pollution)

Port or wrap in JS. Do **not** rewrite LibreWolf / Gecko. Do **not** land Rust crates yet.

| Duppel surface | Phase 1 | Notes |
|----------------|---------|-------|
| `manifest.json` | **Port now** | Firefox event page (`background.scripts`), gecko id, `sidebar_action` instead of `sidePanel`, `strict_min_version` 128 for MAIN world. |
| Mode / first-run / XOR prefs | **New (this scaffold)** | `darkstr.mode`, `darkstr.nativeCompatible`. No Chrome equivalent of Homogeneous vs Pollution. |
| Native-Compatible | **Port now (global bool)** | Duppel is per-eTLD+1 (`nativeCompatSites`). Phase 1 ships the independent bool; per-site map is a Phase 1 follow-up, same JS layer. |
| `rules/tracking.json` | **Port slim now** | GPC + 17 tracking-param strip. Full Duppel ruleset + Client Hints SET (A1 / PR #2) follow in Phase 1 once the Chrome SET path lands. |
| `background.js` identity / rotation / DNR orchestration | **Port next (Phase 1)** | Rewrite onto `browser.*` + event page. No service worker. |
| `profiles.js` | **Port next (Phase 1)** | Persona families stay JS this phase. |
| `anti-fingerprint-bootstrap.js` + `src/content/anti-fingerprint/*` | **Port next (Phase 1)** | Inject via `browser.scripting.executeScript({ func, args, world: "MAIN" })`. Firefox 128+ / LibreWolf current train. |
| `bridge.js` | **Port next (Phase 1)** | ISOLATED content script. Drop Chrome-only bits. |
| `poisoner.js` + chaff scheduler | **Port next (Phase 1)** | `alarms` works on Firefox event pages. |
| Popup / identity inspector | **Port next (Phase 1)** | Use `action.default_popup` + `sidebar_action`. Not Chrome `sidePanel`. |
| `cookies` clean | **Port late Phase 1** | API exists; Firefox host perms are revocable — request on first-run. |
| `privacy` WebRTC policy | **Port late Phase 1** | `browser.privacy.network.webRTCIPHandlingPolicy`. LibreWolf already tightens WebRTC; set only in Pollution and only if controllable. |
| Strict-next-nav / success-driven DNR | **Port late Phase 1** | Fragile as content-script timing; keep JS, list native as must-have. |
| Client Hints HTTP SET | **Depends on Duppel A1** | Chrome DNR SET is still the learning path (PR #2). Firefox DNR header SET is the port, not a rewrite. |
| Playwright / CreepJS / BrowserLeaks | **Proof, Phase 1** | New LibreWolf-headed matrix. Mode exclusivity is a release gate. |

## Phase 2 — Rust crates + LibreWolf-based fork (not this repo’s job yet)

Do not start these in Phase 1. Gecko is the shell; crates become source of truth later.

| Surface | Why defer |
|---------|-----------|
| `duppel-persona` crate | Single source of truth for families / seed / rotation across networking + DOM. |
| `duppel-chaff` crate | Native scheduler + stealthier beacons than extension `fetch`. |
| `duppel-coherence` crate | HTTP↔JS assertion harness feeding Proof. |
| Unified UA / Client Hints at process start | Extension DNR cannot own TLS / first-request the way necko can. |
| Canvas / WebGL / Audio + workers in-engine | Deeper than MAIN-world hooks; lie-detection resistant. |
| Strict-next-nav at DocShell | Load flags, not `webNavigation` races. |
| Auto-RFP-off when Pollution pref is on | Browser pref, not WebExt. |
| Native-Compatible site list in a privacy pane | Fork UI. |
| Auto-update / signing / notarization | Fork distribution. |
| Servo / Ladybird | Track D research only. |

## Explicit non-ports (any phase)

- TLS / JA3 spoof marketing
- “Beats Cloudflare / Turnstile”
- Anti-detect multi-account browser lane
- Claiming to be official LibreWolf
- Rewriting LibreWolf in Rust
