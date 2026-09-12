# Firefox / LibreWolf constraints vs Chrome Duppel

Researched 2026-09-12 against MDN, Firefox Extension Workshop, LibreWolf FAQ, and Duppel `main` / A1.

Chrome Duppel manifest today: SW background, `sidePanel`, `declarativeNetRequest`, `scripting` MAIN inject, `privacy`, `cookies`, `<all_urls>`.

## Background

| | Chrome MV3 | Firefox MV3 / LibreWolf |
|---|---|---|
| Context | Service worker required | **Event page** (`background.scripts`). `service_worker` is **not supported** (bug 1573659). Before Firefox 121 a SW key could prevent the event page from starting. |
| Lifetime | Terminates aggressively | Event page unloads when idle (`persistent: false` is the MV3 default). Persist in `storage`. |
| Phase 1 choice | — | `background.scripts` only. Do not list `service_worker`. |

## declarativeNetRequest

Both browsers implement DNR. Firefox **also** keeps blocking `webRequest`. Phase 1 stays on DNR for Duppel parity. Do not add `webRequest` just for optional Turnstile detection (Duppel non-goal).

Static rulesets + `updateEnabledRulesets` are the XOR switch: ruleset **off** in Homogeneous, Native-Compatible, and RFP-conflict.

Client Hints: Chrome A1 is still “strip, not SET”. Firefox inherits the same gap until A1 lands, then port the SET rules.

## executeScript MAIN world

Duppel injects `bootstrapAntiFingerprint(seed)` with `chrome.scripting.executeScript({ func, args, world: "MAIN" })` — not a manifest MAIN content script.

Firefox added `world: "MAIN"` in **128**. LibreWolf tracks current Firefox stable (~155 in Sep 2026). `strict_min_version`: **128.0**.

Need `scripting` **and** host permission for the tab URL. Privileged pages (`about:*`, AMO, PDF) fail; catch and skip.

## sidePanel vs sidebar

Chrome `side_panel` / `sidePanel` **do not exist** in Firefox. Use `sidebar_action` + `action.default_popup`. Chrome Duppel has no `default_popup` (toolbar opens the side panel). Firefox needs an explicit popup.

## privacy API

`browser.privacy.network.webRTCIPHandlingPolicy` exists (`default_public_interface_only`, etc.). GPC / HTTPS-only are largely **read-only**.

**RFP is not an extension setting.** `privacy.resistFingerprinting` is an `about:config` / `librewolf.cfg` pref. The extension cannot flip it. Phase 1: document the user step, probe timezone UTC, refuse Pollution if RFP looks on.

LibreWolf already ships GPC, WebRTC ICE limits, uBO, ETP/dFPI. Pollution must not fight those except the explicit RFP-off.

## cookies

API is the same family (`cookies` + matching host permissions). Firefox users can revoke hosts later; always `permissions.contains` before `cookies.getAll` / clean.

Duppel’s “cookie containering” was already removed from the product story (Sprint 0 description hygiene). Phase 1 should not revive it.

## Host permissions

Firefox treats `host_permissions` as revocable. Since Firefox 127 they appear on the install prompt and are granted by default, but users can deny. Temporary add-on loads via `about:debugging` skip some install prompts.

First-run **Grant site access** calls `browser.permissions.request({ origins: ["<all_urls>"] })` from a user gesture.

## Other Firefox vs Chrome nits

- Use `browser.*` (promises). `chrome.*` callbacks exist as a porting aid; new code should be `browser.*`.
- Structured clone for messages / `executeScript` results (Chrome is JSON).
- `match_origin_as_fallback` on content scripts is Chrome-flavored; do not rely on it.
- Unsigned permanent install is blocked on release-class Firefox/LibreWolf. Phase 1 install path is **Load Temporary Add-on**. Permanent later needs AMO signing or a fork policy.
- gecko `browser_specific_settings.gecko.id` is required for any non-temporary install: `darkstr@alex-hinojosa`.
- LibreWolf: extra add-ons make you stand out; Phase 1 is a single companion, not a stack of fingerprint toys.

## LibreWolf product conflict

RFP doctrine: everyone looks identical; customizing RFP metrics hurts the set. Duppel doctrine: coherent differentness + pollution.

**Ship modes, not a frankenstein default.** Homogeneous = stay in the LibreWolf set. Pollution = RFP off, then persona. Never RFP + Pollution.
