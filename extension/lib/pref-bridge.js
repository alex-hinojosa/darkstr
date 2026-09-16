/**
 * darkstr Phase 2 — WebExt ↔ chrome prefs bridge glue.
 *
 * On the darkstr fork (or temporary-load with WebExtension experiments),
 * browser.darkstrPrefs talks to Services.prefs for Proof-pin keys.
 * Chrome is authoritative: startup pulls chrome → storage; Settings/popup
 * writes push storage → chrome.
 *
 * Stock LibreWolf companion without experiments: soft no-op (storage-only).
 * Never writes privacy.* from this module (ModeXor owns RFP/FPP).
 *
 * Brand: darkstr — not official LibreWolf. Not anti-detect / not Cloudflare bypass.
 */
"use strict";

const PREF_BRIDGE_KEYS = Object.freeze([
  "darkstr.mode",
  "darkstr.nativeCompatible",
  "darkstr.nativeCompatSites",
  "darkstr.strictFirstDoc",
  "darkstr.nativePersonaHooks",
]);

/** @type {{ syncingFromChrome: boolean, available: boolean|null, listenerBound: boolean }} */
const PREF_BRIDGE_STATE = {
  syncingFromChrome: false,
  available: null,
  listenerBound: false,
};

/**
 * Pick the subset of Proof-pin keys from a prefs-like object.
 * @param {object} prefs
 * @returns {object}
 */
function pickBridgePrefs(prefs) {
  const src = prefs && typeof prefs === "object" ? prefs : {};
  const out = {};
  for (const key of PREF_BRIDGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  return out;
}

/**
 * Detect experiment API. Soft: never throws.
 * @returns {object|null} browser.darkstrPrefs or null
 */
function getDarkstrPrefsApi() {
  try {
    const B = typeof browser !== "undefined" ? browser : chrome;
    if (B && B.darkstrPrefs && typeof B.darkstrPrefs.getAll === "function") {
      return B.darkstrPrefs;
    }
  } catch (_e) {
    /* stock path */
  }
  return null;
}

/**
 * @returns {Promise<boolean>}
 */
async function isPrefBridgeAvailable() {
  if (PREF_BRIDGE_STATE.available === true) return true;
  if (PREF_BRIDGE_STATE.available === false) return false;
  const api = getDarkstrPrefsApi();
  if (!api) {
    PREF_BRIDGE_STATE.available = false;
    return false;
  }
  try {
    if (typeof api.isAvailable === "function") {
      const ok = await api.isAvailable();
      PREF_BRIDGE_STATE.available = ok === true;
      return PREF_BRIDGE_STATE.available;
    }
    PREF_BRIDGE_STATE.available = true;
    return true;
  } catch (_e) {
    PREF_BRIDGE_STATE.available = false;
    return false;
  }
}

/**
 * Push Proof-pin storage values to chrome. No-op when experiment missing
 * or when we are currently applying a chrome→storage pull (echo guard).
 * @param {object} prefs normalized storage prefs
 * @returns {Promise<{ok:boolean, reason?:string, chrome?:object}>}
 */
async function pushPrefsToChrome(prefs) {
  if (PREF_BRIDGE_STATE.syncingFromChrome) {
    return { ok: false, reason: "echo_guard" };
  }
  const api = getDarkstrPrefsApi();
  if (!api) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const partial = pickBridgePrefs(prefs);
    const chrome = await api.setPrefs(partial);
    PREF_BRIDGE_STATE.available = true;
    return { ok: true, chrome };
  } catch (err) {
    console.warn(
      "darkstr pref-bridge push failed:",
      err && err.message ? err.message : err
    );
    return { ok: false, reason: "push_error" };
  }
}

/**
 * Pull chrome Proof-pin prefs into a plain object (not yet written to storage).
 * @returns {Promise<{ok:boolean, prefs?:object, reason?:string}>}
 */
async function pullPrefsFromChrome() {
  const api = getDarkstrPrefsApi();
  if (!api) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const chromePrefs = await api.getAll();
    PREF_BRIDGE_STATE.available = true;
    return { ok: true, prefs: pickBridgePrefs(chromePrefs) };
  } catch (err) {
    console.warn(
      "darkstr pref-bridge pull failed:",
      err && err.message ? err.message : err
    );
    return { ok: false, reason: "pull_error" };
  }
}

/**
 * Startup: chrome authoritative when experiment present.
 * Writes chrome values into storage via savePrefsFn (caller-owned).
 * @param {{ savePrefs: (partial: object) => Promise<object> }} hooks
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function syncChromeAuthoritativeOnStartup(hooks) {
  const pulled = await pullPrefsFromChrome();
  if (!pulled.ok) {
    return { ok: false, reason: pulled.reason || "unavailable" };
  }
  if (!hooks || typeof hooks.savePrefs !== "function") {
    return { ok: false, reason: "no_save" };
  }
  PREF_BRIDGE_STATE.syncingFromChrome = true;
  try {
    await hooks.savePrefs(pulled.prefs);
    return { ok: true };
  } finally {
    PREF_BRIDGE_STATE.syncingFromChrome = false;
  }
}

/**
 * Bind chrome onChanged → storage mirror. Idempotent.
 * @param {{ savePrefs: (partial: object) => Promise<object> }} hooks
 * @returns {Promise<boolean>} true if listener bound
 */
async function bindChromePrefListener(hooks) {
  if (PREF_BRIDGE_STATE.listenerBound) return true;
  const api = getDarkstrPrefsApi();
  if (!api || typeof api.onChanged !== "object" || !api.onChanged.addListener) {
    return false;
  }
  if (!hooks || typeof hooks.savePrefs !== "function") {
    return false;
  }
  try {
    api.onChanged.addListener(async (change) => {
      if (!change || !change.prefs) return;
      PREF_BRIDGE_STATE.syncingFromChrome = true;
      try {
        await hooks.savePrefs(pickBridgePrefs(change.prefs));
      } catch (err) {
        console.warn(
          "darkstr pref-bridge chrome→storage failed:",
          err && err.message ? err.message : err
        );
      } finally {
        PREF_BRIDGE_STATE.syncingFromChrome = false;
      }
    });
    PREF_BRIDGE_STATE.listenerBound = true;
    PREF_BRIDGE_STATE.available = true;
    return true;
  } catch (err) {
    console.warn(
      "darkstr pref-bridge listener bind failed:",
      err && err.message ? err.message : err
    );
    return false;
  }
}

/**
 * Full init: pull chrome → storage, then listen for about:config flips.
 * @param {{ savePrefs: (partial: object) => Promise<object> }} hooks
 */
async function initPrefBridge(hooks) {
  const available = await isPrefBridgeAvailable();
  if (!available) {
    return { ok: false, reason: "unavailable" };
  }
  await syncChromeAuthoritativeOnStartup(hooks);
  await bindChromePrefListener(hooks);
  return { ok: true };
}

if (typeof globalThis !== "undefined") {
  globalThis.PREF_BRIDGE_KEYS = PREF_BRIDGE_KEYS;
  globalThis.PREF_BRIDGE_STATE = PREF_BRIDGE_STATE;
  globalThis.pickBridgePrefs = pickBridgePrefs;
  globalThis.getDarkstrPrefsApi = getDarkstrPrefsApi;
  globalThis.isPrefBridgeAvailable = isPrefBridgeAvailable;
  globalThis.pushPrefsToChrome = pushPrefsToChrome;
  globalThis.pullPrefsFromChrome = pullPrefsFromChrome;
  globalThis.syncChromeAuthoritativeOnStartup = syncChromeAuthoritativeOnStartup;
  globalThis.bindChromePrefListener = bindChromePrefListener;
  globalThis.initPrefBridge = initPrefBridge;
}
