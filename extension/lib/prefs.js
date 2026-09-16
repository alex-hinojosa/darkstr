/**
 * darkstr Phase 1 — provisional preference keys.
 *
 * Proof pin (see docs/PROOF-PIN.md):
 *   darkstr.mode                = "homogeneous" | "pollution"   (XOR)
 *   darkstr.nativeCompatible    = boolean                       (independent, global escape)
 *   darkstr.nativeCompatSites   = { [etld1]: true }             (per-site escape)
 *   darkstr.strictFirstDoc      = boolean                       (strict-next-nav coherence)
 *   darkstr.nativePersonaHooks  = boolean                       (M3: disable MAIN inject when native path)
 *
 * Phase 1 / stock LibreWolf companion: live in browser.storage.local only.
 * Phase 2 fork bridge (lib/pref-bridge.js + experiments/darkstr_prefs):
 *   same keys under about:config via Services.prefs when browser.darkstrPrefs
 *   is available; chrome is authoritative. Stock without experiments = storage-only.
 * Never writes privacy.* from WebExt (ModeXor owns RFP/FPP). Hooks default-off.
 * Browser RFP prefs are documented separately.
 */
"use strict";

const DARKSTR_PREF = Object.freeze({
  MODE: "darkstr.mode",
  NATIVE_COMPATIBLE: "darkstr.nativeCompatible",
  NATIVE_COMPAT_SITES: "darkstr.nativeCompatSites",
  STRICT_FIRST_DOC: "darkstr.strictFirstDoc",
  NATIVE_PERSONA_HOOKS: "darkstr.nativePersonaHooks",
  FIRST_RUN_DONE: "darkstr.firstRunDone",
  HOST_PERMS_OK: "darkstr.hostPermsOk",
});

const DARKSTR_MODE = Object.freeze({
  HOMOGENEOUS: "homogeneous",
  POLLUTION: "pollution",
});

const DARKSTR_DEFAULTS = Object.freeze({
  [DARKSTR_PREF.MODE]: DARKSTR_MODE.HOMOGENEOUS,
  [DARKSTR_PREF.NATIVE_COMPATIBLE]: false,
  [DARKSTR_PREF.NATIVE_COMPAT_SITES]: Object.freeze({}),
  [DARKSTR_PREF.STRICT_FIRST_DOC]: true,
  [DARKSTR_PREF.NATIVE_PERSONA_HOOKS]: false,
  [DARKSTR_PREF.FIRST_RUN_DONE]: false,
  [DARKSTR_PREF.HOST_PERMS_OK]: false,
});

function isDarkstrMode(value) {
  return value === DARKSTR_MODE.HOMOGENEOUS || value === DARKSTR_MODE.POLLUTION;
}

/**
 * Coerce raw storage into a legal prefs object.
 * Illegal / missing mode → homogeneous (safe default; does not fight LibreWolf RFP).
 * nativeCompatible / nativeCompatSites / strictFirstDoc / nativePersonaHooks are independent of mode.
 */
function normalizeDarkstrPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = isDarkstrMode(src[DARKSTR_PREF.MODE])
    ? src[DARKSTR_PREF.MODE]
    : DARKSTR_DEFAULTS[DARKSTR_PREF.MODE];
  const sitesFn =
    (typeof globalThis !== "undefined" &&
      typeof globalThis.normalizeNativeCompatSites === "function" &&
      globalThis.normalizeNativeCompatSites) ||
    (typeof normalizeNativeCompatSites === "function" && normalizeNativeCompatSites) ||
    null;
  const sites = sitesFn
    ? sitesFn(src[DARKSTR_PREF.NATIVE_COMPAT_SITES])
    : Object.assign(
        {},
        src[DARKSTR_PREF.NATIVE_COMPAT_SITES] &&
          typeof src[DARKSTR_PREF.NATIVE_COMPAT_SITES] === "object"
          ? Object.fromEntries(
              Object.entries(src[DARKSTR_PREF.NATIVE_COMPAT_SITES]).filter(
                ([, v]) => v === true
              )
            )
          : {}
      );
  // strictFirstDoc defaults true (Duppel production default). Explicit false sticks.
  const strictRaw = src[DARKSTR_PREF.STRICT_FIRST_DOC];
  const strictFirstDoc =
    strictRaw === false ? false : strictRaw === true ? true : true;
  const nativeHooks = src[DARKSTR_PREF.NATIVE_PERSONA_HOOKS] === true;
  return {
    [DARKSTR_PREF.MODE]: mode,
    [DARKSTR_PREF.NATIVE_COMPATIBLE]: src[DARKSTR_PREF.NATIVE_COMPATIBLE] === true,
    [DARKSTR_PREF.NATIVE_COMPAT_SITES]: sites,
    [DARKSTR_PREF.STRICT_FIRST_DOC]: strictFirstDoc,
    [DARKSTR_PREF.NATIVE_PERSONA_HOOKS]: nativeHooks,
    [DARKSTR_PREF.FIRST_RUN_DONE]: src[DARKSTR_PREF.FIRST_RUN_DONE] === true,
    [DARKSTR_PREF.HOST_PERMS_OK]: src[DARKSTR_PREF.HOST_PERMS_OK] === true,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.DARKSTR_PREF = DARKSTR_PREF;
  globalThis.DARKSTR_MODE = DARKSTR_MODE;
  globalThis.DARKSTR_DEFAULTS = DARKSTR_DEFAULTS;
  globalThis.isDarkstrMode = isDarkstrMode;
  globalThis.normalizeDarkstrPrefs = normalizeDarkstrPrefs;
}
