/**
 * darkstr Phase 1 — provisional preference keys.
 *
 * Proof pin (see docs/PROOF-PIN.md):
 *   darkstr.mode              = "homogeneous" | "pollution"   (XOR)
 *   darkstr.nativeCompatible  = boolean                       (independent)
 *
 * These live in browser.storage.local. They are NOT about:config prefs.
 * Browser RFP prefs are documented separately and are user-set.
 */
"use strict";

const DARKSTR_PREF = Object.freeze({
  MODE: "darkstr.mode",
  NATIVE_COMPATIBLE: "darkstr.nativeCompatible",
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
  [DARKSTR_PREF.FIRST_RUN_DONE]: false,
  [DARKSTR_PREF.HOST_PERMS_OK]: false,
});

function isDarkstrMode(value) {
  return value === DARKSTR_MODE.HOMOGENEOUS || value === DARKSTR_MODE.POLLUTION;
}

/**
 * Coerce raw storage into a legal prefs object.
 * Illegal / missing mode → homogeneous (safe default; does not fight LibreWolf RFP).
 * nativeCompatible is independent of mode.
 */
function normalizeDarkstrPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = isDarkstrMode(src[DARKSTR_PREF.MODE])
    ? src[DARKSTR_PREF.MODE]
    : DARKSTR_DEFAULTS[DARKSTR_PREF.MODE];
  return {
    [DARKSTR_PREF.MODE]: mode,
    [DARKSTR_PREF.NATIVE_COMPATIBLE]: src[DARKSTR_PREF.NATIVE_COMPATIBLE] === true,
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
