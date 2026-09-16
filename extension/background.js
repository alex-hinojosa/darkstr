/**
 * darkstr Phase 1 background (Firefox event page — not a Chrome service worker).
 *
 * Owns XOR mode prefs, session persona seed, MAIN-world bootstrap inject,
 * success-driven tab-scoped UA/CH DNR, per-site Native-Compatible,
 * strict-first-document next-nav arming, pollution-gated chaff, and
 * tracker-cookie purge (Firefox cookies API — not containers).
 *
 * Scripts loaded via manifest background.scripts (no importScripts):
 *   lib/sites.js, lib/tracker-cookies.js, lib/prefs.js, lib/modes.js,
 *   lib/profiles.js, poisoner.js, anti-fingerprint-bootstrap.js, background.js
 */
"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;

const UA_SESSION_RULE_ID = 9001;
const STRICT_ARM_BASE = 9100;
const STRICT_ARM_MAX = 9899;
const CHAFF_ALARM = "firePoisonBeacons";
const ROTATE_ALARM = "rotateIdentity";
const COOKIE_ALARM = "cleanTrackerCookies";

const PERSONA_STATE = {
  sessionSeed: 0,
  profile: null,
  chaosLevel: "balanced",
  bootstrappedTabs: new Set(),
  bootstrappedDocs: new Set(),
  stats: {
    fakeBeaconsFired: 0,
    identityRotations: 0,
    domChaffApplied: 0,
    cookiesCleaned: 0,
  },
};

/** @type {Map<number, number>} tabId -> session DNR rule id for strict arm */
const armedTabs = new Map();
let nextStrictArmRuleId = STRICT_ARM_BASE;

const STATE = {
  prefs: normalizeDarkstrPrefs(DARKSTR_DEFAULTS),
  activation: null,
  lastRfp: { likelyRfp: false, timeZone: null },
};

async function loadPrefs() {
  const raw = await B.storage.local.get([
    ...Object.values(DARKSTR_PREF),
    "darkstr.chaosLevel",
    "darkstr.stats",
  ]);
  STATE.prefs = normalizeDarkstrPrefs(raw);
  if (raw["darkstr.chaosLevel"]) {
    const legacy = { stealth: "quiet", chaos: "loud" };
    const lvl = raw["darkstr.chaosLevel"];
    PERSONA_STATE.chaosLevel = legacy[lvl] || lvl;
  }
  if (raw["darkstr.stats"] && typeof raw["darkstr.stats"] === "object") {
    Object.assign(PERSONA_STATE.stats, raw["darkstr.stats"]);
  }
  return STATE.prefs;
}

async function savePrefs(partial) {
  const next = normalizeDarkstrPrefs({ ...STATE.prefs, ...partial });
  assertModeXor(next[DARKSTR_PREF.MODE]);
  await B.storage.local.set(next);
  STATE.prefs = next;
  await applyActivation();
  return next;
}

async function persistPersonaStats() {
  await B.storage.local.set({ "darkstr.stats": PERSONA_STATE.stats });
}

function nativeCompatSites() {
  return STATE.prefs[DARKSTR_PREF.NATIVE_COMPAT_SITES] || Object.create(null);
}

function strictFirstDocEnabled() {
  return STATE.prefs[DARKSTR_PREF.STRICT_FIRST_DOC] !== false;
}

/** M3: when native persona hooks are on, skip WebExt MAIN inject (avoid split-brain). */
function nativePersonaHooksEnabled() {
  return STATE.prefs[DARKSTR_PREF.NATIVE_PERSONA_HOOKS] === true;
}

function siteIsNativeCompat(urlOrHost) {
  return isNativeCompatSite(nativeCompatSites(), urlOrHost);
}

async function probeActiveTabRfp() {
  try {
    const tabs = await B.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null || !tab.url || !/^https?:/.test(tab.url)) {
      return STATE.lastRfp;
    }
    const results = await B.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return { timeZone: tz, likelyRfp: tz === "UTC" };
      },
      world: "ISOLATED",
    });
    const value = results && results[0] && results[0].result;
    if (value) STATE.lastRfp = value;
  } catch (err) {
    console.warn("darkstr rfp probe skipped:", err && err.message);
  }
  return STATE.lastRfp;
}

function pollutionSurfacesArmed() {
  return !!(STATE.activation && STATE.activation.pollutionActive);
}

/** Global Pollution armed AND this URL is not on the per-site native-compat map. */
function pollutionActiveForUrl(url) {
  return pollutionSurfacesArmed() && !siteIsNativeCompat(url);
}

async function ensureSessionPersona() {
  if (PERSONA_STATE.sessionSeed && PERSONA_STATE.profile) {
    return PERSONA_STATE.profile;
  }
  try {
    const sessionData = await B.storage.session.get([
      "darkstr.sessionSeed",
      "darkstr.profile",
    ]);
    if (sessionData["darkstr.sessionSeed"]) {
      PERSONA_STATE.sessionSeed = sessionData["darkstr.sessionSeed"];
      PERSONA_STATE.profile =
        sessionData["darkstr.profile"] ||
        generateProfile(PERSONA_STATE.sessionSeed);
      if (PERSONA_STATE.profile && typeof POISONER !== "undefined") {
        POISONER.selectPersona();
      }
      return PERSONA_STATE.profile;
    }
  } catch (_) {
    /* storage.session may be unavailable in odd contexts */
  }
  return rotateIdentity(false);
}

async function clearAllStrictArmRules() {
  const ids = [...armedTabs.values()];
  armedTabs.clear();
  if (!ids.length) return;
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: ids,
    });
  } catch (_) {}
}

async function clearStrictArmForTab(tabId) {
  const ruleId = armedTabs.get(tabId);
  if (ruleId == null) return;
  armedTabs.delete(tabId);
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
  } catch (_) {}
}

function allocStrictArmRuleId() {
  // Prefer unused ids in the pool; wrap if needed.
  for (let i = 0; i < STRICT_ARM_MAX - STRICT_ARM_BASE + 1; i++) {
    const id = nextStrictArmRuleId;
    nextStrictArmRuleId += 1;
    if (nextStrictArmRuleId > STRICT_ARM_MAX) nextStrictArmRuleId = STRICT_ARM_BASE;
    let inUse = false;
    for (const used of armedTabs.values()) {
      if (used === id) {
        inUse = true;
        break;
      }
    }
    if (!inUse) return id;
  }
  return STRICT_ARM_BASE;
}

async function armStrictNextNav(tabId) {
  if (!PERSONA_STATE.profile) return;
  const requestHeaders = buildPersonaRequestHeaders(PERSONA_STATE.profile);
  if (!requestHeaders.length) return;

  await clearStrictArmForTab(tabId);
  const ruleId = allocStrictArmRuleId();
  armedTabs.set(tabId, ruleId);
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [
        {
          id: ruleId,
          priority: 3,
          action: {
            type: "modifyHeaders",
            requestHeaders,
          },
          condition: {
            urlFilter: "*",
            tabIds: [tabId],
            resourceTypes: ["main_frame"],
          },
        },
      ],
    });
  } catch (err) {
    armedTabs.delete(tabId);
    console.warn("darkstr strict-arm DNR failed:", err && err.message);
  }
}

async function rotateIdentity(reloadTabs) {
  const seed = generateSessionSeed();
  const profile = generateProfile(seed);
  PERSONA_STATE.sessionSeed = seed;
  PERSONA_STATE.profile = profile;
  PERSONA_STATE.bootstrappedTabs.clear();
  PERSONA_STATE.bootstrappedDocs.clear();
  await clearAllStrictArmRules();
  PERSONA_STATE.stats.identityRotations += 1;
  if (typeof POISONER !== "undefined") {
    POISONER.selectPersona();
  }
  try {
    await B.storage.session.set({
      "darkstr.sessionSeed": seed,
      "darkstr.profile": profile,
    });
  } catch (_) {}
  await persistPersonaStats();
  await clearTabScopedUaDnr();
  if (reloadTabs && pollutionSurfacesArmed()) {
    try {
      const tabs = await B.tabs.query({ url: ["http://*/*", "https://*/*"] });
      await Promise.all(
        (tabs || []).map((t) => B.tabs.reload(t.id).catch(() => {}))
      );
    } catch (_) {}
  }
  return profile;
}

async function clearTabScopedUaDnr() {
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [UA_SESSION_RULE_ID],
    });
  } catch (_) {}
}

async function updateTabScopedUaDnr() {
  if (!pollutionSurfacesArmed() || !PERSONA_STATE.profile) {
    await clearTabScopedUaDnr();
    return;
  }
  const tabIds = [...PERSONA_STATE.bootstrappedTabs];
  if (tabIds.length === 0) {
    await clearTabScopedUaDnr();
    return;
  }
  const requestHeaders = buildPersonaRequestHeaders(PERSONA_STATE.profile);
  if (!requestHeaders.length) {
    await clearTabScopedUaDnr();
    return;
  }
  // Full session rule replaces any strict-arm rules for these bootstrapped tabs.
  const armIdsToClear = [];
  for (const tabId of tabIds) {
    if (armedTabs.has(tabId)) {
      armIdsToClear.push(armedTabs.get(tabId));
      armedTabs.delete(tabId);
    }
  }
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [UA_SESSION_RULE_ID, ...armIdsToClear],
      addRules: [
        {
          id: UA_SESSION_RULE_ID,
          priority: 3,
          action: {
            type: "modifyHeaders",
            requestHeaders,
          },
          condition: {
            urlFilter: "*",
            tabIds,
            resourceTypes: [
              "main_frame",
              "sub_frame",
              "xmlhttprequest",
              "script",
              "image",
              "stylesheet",
              "font",
              "media",
              "other",
            ],
          },
        },
      ],
    });
  } catch (err) {
    console.warn("darkstr tab-scoped UA DNR failed:", err && err.message);
  }
}

function isInjectableUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:/i.test(url)) return false;
  if (url.startsWith("about:")) return false;
  if (url.startsWith("moz-extension:")) return false;
  if (url.startsWith("chrome:")) return false;
  if (url.startsWith("chrome-extension:")) return false;
  return true;
}

async function injectPersona(tabId, url) {
  if (!pollutionActiveForUrl(url)) return;
  if (nativePersonaHooksEnabled()) {
    // Native path owns Navigator/HTTP — WebExt MAIN inject stays off.
    return;
  }
  if (!PERSONA_STATE.sessionSeed) await ensureSessionPersona();
  if (!PERSONA_STATE.sessionSeed || !PERSONA_STATE.profile) return;
  if (!isInjectableUrl(url)) return;
  if (typeof bootstrapAntiFingerprint !== "function") {
    console.error("darkstr: bootstrapAntiFingerprint missing from event page");
    return;
  }

  const docKey = `${tabId}:${url}`;
  if (PERSONA_STATE.bootstrappedDocs.has(docKey)) return;

  try {
    await B.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: "MAIN",
      injectImmediately: true,
      func: bootstrapAntiFingerprint,
      args: [PERSONA_STATE.sessionSeed],
    });
    PERSONA_STATE.bootstrappedDocs.add(docKey);
    PERSONA_STATE.bootstrappedTabs.add(tabId);
    await clearStrictArmForTab(tabId);
    await updateTabScopedUaDnr();
  } catch (err) {
    PERSONA_STATE.bootstrappedTabs.delete(tabId);
    await updateTabScopedUaDnr();
    console.warn("darkstr MAIN inject skipped:", err && err.message);
  }
}

async function revokeBootstrap(tabId, { keepStrictArm = false } = {}) {
  if (!PERSONA_STATE.bootstrappedTabs.has(tabId)) return;
  PERSONA_STATE.bootstrappedTabs.delete(tabId);
  for (const key of [...PERSONA_STATE.bootstrappedDocs]) {
    if (key.startsWith(`${tabId}:`)) PERSONA_STATE.bootstrappedDocs.delete(key);
  }
  if (!keepStrictArm) {
    await updateTabScopedUaDnr();
  } else {
    await updateTabScopedUaDnr();
  }
}


async function hostPermissionsGranted() {
  try {
    return await B.permissions.contains({ origins: ["<all_urls>"] });
  } catch (_) {
    return false;
  }
}

/**
 * Purge cookies whose Domain matches the static known-tracker list.
 * Honest scope: list match only. Not cookie containers. Not a first-party wipe.
 * Requires host access; callers should surface permission errors to the UI.
 */
async function cleanTrackerCookies() {
  const granted = await hostPermissionsGranted();
  if (!granted) {
    return { cleaned: 0, error: "host_permissions_required", scanned: 0 };
  }
  if (typeof selectTrackerCookies !== "function" || typeof cookieRemoveUrl !== "function") {
    return { cleaned: 0, error: "tracker_cookies_lib_missing", scanned: 0 };
  }
  try {
    const cookies = await B.cookies.getAll({});
    const targets = selectTrackerCookies(cookies || []);
    let cleaned = 0;
    for (const cookie of targets) {
      const url = cookieRemoveUrl(cookie);
      if (!url || !cookie.name) continue;
      try {
        const removed = await B.cookies.remove({ url, name: cookie.name });
        if (removed) cleaned += 1;
      } catch (_) {
        /* best-effort per cookie */
      }
    }
    if (cleaned > 0) {
      PERSONA_STATE.stats.cookiesCleaned =
        (PERSONA_STATE.stats.cookiesCleaned || 0) + cleaned;
      await persistPersonaStats();
    }
    return { cleaned, scanned: (cookies || []).length, matched: targets.length };
  } catch (err) {
    return {
      cleaned: 0,
      error: String(err && err.message ? err.message : err),
      scanned: 0,
    };
  }
}

function scheduleCookieClean() {
  // Independent of XOR: tracker-cookie purge helps in both modes when hosts are granted.
  B.alarms.create(COOKIE_ALARM, { periodInMinutes: 15 });
}

async function clearCookieCleanAlarm() {
  try {
    await B.alarms.clear(COOKIE_ALARM);
  } catch (_) {}
}

function scheduleChaff() {
  if (!pollutionSurfacesArmed()) {
    B.alarms.clear(CHAFF_ALARM).catch(() => {});
    return;
  }
  const delay = POISONER.getNextInterval(PERSONA_STATE.chaosLevel);
  B.alarms.create(CHAFF_ALARM, { delayInMinutes: delay });
}

function scheduleRotate() {
  if (!pollutionSurfacesArmed()) {
    B.alarms.clear(ROTATE_ALARM).catch(() => {});
    return;
  }
  B.alarms.create(ROTATE_ALARM, { periodInMinutes: 24 * 60 });
}

async function queueChaffToActiveTab() {
  if (!pollutionSurfacesArmed()) return { queued: 0 };
  const configs = POISONER.buildBatchConfigs(PERSONA_STATE.chaosLevel);
  const domChaff = POISONER.buildDOMChaffPayload(PERSONA_STATE.chaosLevel);
  try {
    const tabs = await B.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null || !isInjectableUrl(tab.url)) {
      return { queued: 0 };
    }
    if (siteIsNativeCompat(tab.url)) {
      return { queued: 0 };
    }
    await B.tabs.sendMessage(tab.id, {
      type: "queueChaff",
      configs,
      domChaff,
    });
    return { queued: configs.length };
  } catch (_) {
    return { queued: 0 };
  }
}

async function setTrackingRulesEnabled(enable) {
  try {
    await B.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enable ? ["tracking_rules"] : [],
      disableRulesetIds: enable ? [] : ["tracking_rules"],
    });
  } catch (err) {
    console.warn("darkstr DNR ruleset update failed:", err && err.message);
  }
}

async function applyWebRTCPolicyIfPollution() {
  if (!pollutionSurfacesArmed()) return;
  try {
    if (
      B.privacy &&
      B.privacy.network &&
      B.privacy.network.webRTCIPHandlingPolicy
    ) {
      await B.privacy.network.webRTCIPHandlingPolicy.set({
        value: "default_public_interface_only",
      });
    }
  } catch (err) {
    console.warn("darkstr WebRTC policy skipped:", err && err.message);
  }
}

async function applyActivation() {
  const prefs = STATE.prefs;
  if (prefs[DARKSTR_PREF.MODE] === DARKSTR_MODE.POLLUTION) {
    await probeActiveTabRfp();
  } else {
    STATE.lastRfp = { likelyRfp: false, timeZone: STATE.lastRfp.timeZone };
  }

  STATE.activation = resolveActivation({
    mode: prefs[DARKSTR_PREF.MODE],
    nativeCompatible: prefs[DARKSTR_PREF.NATIVE_COMPATIBLE],
    rfpLikely: !!STATE.lastRfp.likelyRfp,
  });

  const armed = STATE.activation.pollutionActive;
  await setTrackingRulesEnabled(armed && STATE.activation.allowDnrTrackingRules);

  if (armed) {
    await ensureSessionPersona();
    scheduleChaff();
    scheduleRotate();
    await applyWebRTCPolicyIfPollution();
  } else {
    PERSONA_STATE.bootstrappedTabs.clear();
    PERSONA_STATE.bootstrappedDocs.clear();
    await clearAllStrictArmRules();
    await clearTabScopedUaDnr();
    try {
      await B.alarms.clear(CHAFF_ALARM);
      await B.alarms.clear(ROTATE_ALARM);
    } catch (_) {}
  }

  // Cookie purge alarm is XOR-independent; only needs host access.
  if (await hostPermissionsGranted()) {
    scheduleCookieClean();
  } else {
    await clearCookieCleanAlarm();
  }

  try {
    await B.action.setBadgeText({
      text: STATE.activation.rfpConflict
        ? "RFP"
        : prefs[DARKSTR_PREF.MODE] === DARKSTR_MODE.POLLUTION
          ? "P"
          : "H",
    });
    await B.action.setBadgeBackgroundColor({
      color: STATE.activation.rfpConflict
        ? "#b45309"
        : prefs[DARKSTR_PREF.MODE] === DARKSTR_MODE.POLLUTION
          ? "#2ec4b6"
          : "#6b7280",
    });
  } catch (_) {}

  return STATE.activation;
}

function publicState(extra) {
  return {
    prefs: STATE.prefs,
    activation: STATE.activation,
    rfp: STATE.lastRfp,
    profile: pollutionSurfacesArmed() ? PERSONA_STATE.profile : null,
    chaosLevel: PERSONA_STATE.chaosLevel,
    stats: PERSONA_STATE.stats,
    host: typeof DARKSTR_HOST !== "undefined" ? DARKSTR_HOST : null,
    nativeCompatSites: { ...nativeCompatSites() },
    strictFirstDoc: strictFirstDocEnabled(),
    product: {
      name: "darkstr",
      phase: "1",
      positioning:
        "Pollution tool. Not an anti-detect browser. Not a Cloudflare bypass. Not official LibreWolf.",
    },
    ...(extra || {}),
  };
}

async function clearPersonaForEtld1(etld1) {
  const tabs = await B.tabs.query({});
  const affected = [];
  for (const tab of tabs || []) {
    if (!tab.url || tab.id == null) continue;
    try {
      if (getETLD1(new URL(tab.url).hostname) === etld1) {
        affected.push(tab);
        PERSONA_STATE.bootstrappedTabs.delete(tab.id);
        await clearStrictArmForTab(tab.id);
        for (const key of [...PERSONA_STATE.bootstrappedDocs]) {
          if (key.startsWith(`${tab.id}:`)) {
            PERSONA_STATE.bootstrappedDocs.delete(key);
          }
        }
      }
    } catch (_) {}
  }
  await updateTabScopedUaDnr();
  return affected;
}

// === Navigation: success-driven MAIN inject + strict-first-doc ===
B.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  // Strict mode: armed tab keeps main_frame-only DNR through this next nav.
  if (strictFirstDocEnabled() && armedTabs.has(details.tabId)) {
    return;
  }
  await revokeBootstrap(details.tabId);
});

B.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const tabId = details.tabId;
  const url = details.url;

  for (const key of [...PERSONA_STATE.bootstrappedDocs]) {
    if (key.startsWith(`${tabId}:`)) {
      PERSONA_STATE.bootstrappedDocs.delete(key);
    }
  }

  // Skip DNR revoke for armed strict tabs (DNR must persist through nav 2).
  if (
    PERSONA_STATE.bootstrappedTabs.has(tabId) &&
    !(strictFirstDocEnabled() && armedTabs.has(tabId))
  ) {
    PERSONA_STATE.bootstrappedTabs.delete(tabId);
    updateTabScopedUaDnr();
  }

  if (!pollutionSurfacesArmed()) return;
  if (!isInjectableUrl(url)) return;
  if (siteIsNativeCompat(url)) return;

  // Strict-first-doc: first navigation stays all-native (no MAIN inject).
  // Install main_frame-only DNR so the NEXT navigation's HTTP uses persona UA.
  if (strictFirstDocEnabled() && !armedTabs.has(tabId) && !PERSONA_STATE.bootstrappedTabs.has(tabId)) {
    (async () => {
      if (!PERSONA_STATE.profile) await ensureSessionPersona();
      await armStrictNextNav(tabId);
    })().catch((err) => {
      console.warn("darkstr strict arm skipped:", err && err.message);
    });
    return;
  }

  injectPersona(tabId, url);
});

B.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  if (strictFirstDocEnabled() && armedTabs.has(tabId)) return;
  if (PERSONA_STATE.bootstrappedTabs.has(tabId)) {
    revokeBootstrap(tabId);
  }
});

B.tabs.onRemoved.addListener((tabId) => {
  clearStrictArmForTab(tabId);
  revokeBootstrap(tabId);
});

B.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === COOKIE_ALARM) {
    await cleanTrackerCookies();
    return;
  }
  if (!pollutionSurfacesArmed()) return;
  if (alarm.name === CHAFF_ALARM) {
    await queueChaffToActiveTab();
    scheduleChaff();
  } else if (alarm.name === ROTATE_ALARM) {
    await rotateIdentity(true);
  }
});

B.runtime.onInstalled.addListener(async (details) => {
  await loadPrefs();
  if (details.reason === "install" && !STATE.prefs[DARKSTR_PREF.FIRST_RUN_DONE]) {
    const url = B.runtime.getURL("first-run.html");
    try {
      await B.tabs.create({ url });
    } catch (err) {
      console.warn("darkstr first-run tab failed:", err && err.message);
    }
  }
  await applyActivation();
});

B.runtime.onStartup.addListener(async () => {
  await loadPrefs();
  await applyActivation();
});

loadPrefs()
  .then(applyActivation)
  .catch((err) => {
    console.error("darkstr init failed:", err);
  });

B.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = (value) => {
    try {
      sendResponse(value);
    } catch (_) {}
  };

  (async () => {
    if (!msg || typeof msg.type !== "string") {
      reply({ ok: false, error: "bad_message" });
      return;
    }

    switch (msg.type) {
      case "getState":
        await loadPrefs();
        await applyActivation();
        reply({ ok: true, ...publicState() });
        return;

      case "setMode": {
        const mode = assertModeXor(msg.mode);
        await savePrefs({ [DARKSTR_PREF.MODE]: mode });
        reply({ ok: true, ...publicState() });
        return;
      }

      case "setNativeCompatible": {
        await savePrefs({
          [DARKSTR_PREF.NATIVE_COMPATIBLE]: msg.enabled === true,
        });
        reply({ ok: true, ...publicState() });
        return;
      }

      case "setStrictFirstDoc": {
        await savePrefs({
          [DARKSTR_PREF.STRICT_FIRST_DOC]: msg.enabled === true,
        });
        await clearAllStrictArmRules();
        reply({ ok: true, ...publicState() });
        return;
      }

      case "setNativePersonaHooks": {
        // Default remains false in DARKSTR_DEFAULTS. Fork chrome/C++ SoT is about:config
        // until prefs bridge ships; this gate skips WebExt MAIN inject when on.
        await savePrefs({
          [DARKSTR_PREF.NATIVE_PERSONA_HOOKS]: msg.enabled === true,
        });
        reply({ ok: true, ...publicState() });
        return;
      }

      case "setNativeCompatSite": {
        const hostname = String(msg.hostname || "");
        const etld1 = getETLD1(hostname);
        if (!etld1) {
          reply({ ok: false, error: "bad_hostname" });
          return;
        }
        const sites = { ...nativeCompatSites() };
        if (msg.enabled === true) {
          sites[etld1] = true;
        } else {
          delete sites[etld1];
        }
        await savePrefs({ [DARKSTR_PREF.NATIVE_COMPAT_SITES]: sites });
        const affected = await clearPersonaForEtld1(etld1);
        reply({ ok: true, etld1, ...publicState() });
        setTimeout(() => {
          for (const tab of affected) {
            if (tab.id != null) B.tabs.reload(tab.id).catch(() => {});
          }
        }, 300);
        return;
      }

      case "getNativeCompatSite": {
        const hostname = String(msg.hostname || "");
        const etld1 = getETLD1(hostname);
        reply({
          ok: true,
          etld1,
          enabled: !!(etld1 && nativeCompatSites()[etld1]),
        });
        return;
      }

      case "listNativeCompatSites": {
        reply({
          ok: true,
          sites: Object.keys(nativeCompatSites()).sort(),
        });
        return;
      }

      case "removeNativeCompatSite": {
        const etld1 = String(msg.etld1 || "");
        if (!etld1) {
          reply({ ok: false, error: "bad_etld1" });
          return;
        }
        const sites = { ...nativeCompatSites() };
        delete sites[etld1];
        await savePrefs({ [DARKSTR_PREF.NATIVE_COMPAT_SITES]: sites });
        const affected = await clearPersonaForEtld1(etld1);
        reply({ ok: true, etld1, ...publicState() });
        setTimeout(() => {
          for (const tab of affected) {
            if (tab.id != null) B.tabs.reload(tab.id).catch(() => {});
          }
        }, 300);
        return;
      }

      case "completeFirstRun": {
        const mode = assertModeXor(msg.mode || DARKSTR_MODE.HOMOGENEOUS);
        await savePrefs({
          [DARKSTR_PREF.MODE]: mode,
          [DARKSTR_PREF.NATIVE_COMPATIBLE]: msg.nativeCompatible === true,
          [DARKSTR_PREF.FIRST_RUN_DONE]: true,
        });
        reply({ ok: true, ...publicState() });
        return;
      }

      case "requestHostPermissions": {
        const granted = await B.permissions.request({
          origins: ["<all_urls>"],
        });
        await savePrefs({ [DARKSTR_PREF.HOST_PERMS_OK]: granted === true });
        reply({ ok: true, granted: granted === true, ...publicState() });
        return;
      }

      case "checkHostPermissions": {
        const granted = await B.permissions.contains({
          origins: ["<all_urls>"],
        });
        reply({ ok: true, granted: granted === true });
        return;
      }

      case "rotateNow": {
        if (!pollutionSurfacesArmed()) {
          reply({ ok: false, error: "pollution_inactive", rotated: false });
          return;
        }
        await rotateIdentity(true);
        reply({ ok: true, rotated: true, ...publicState() });
        return;
      }

      case "setChaosLevel": {
        const legacy = { stealth: "quiet", chaos: "loud" };
        const level = legacy[msg.level] || msg.level;
        if (level !== "quiet" && level !== "balanced" && level !== "loud") {
          reply({ ok: false, error: "bad_chaos" });
          return;
        }
        PERSONA_STATE.chaosLevel = level;
        await B.storage.local.set({ "darkstr.chaosLevel": level });
        if (pollutionSurfacesArmed()) scheduleChaff();
        reply({ ok: true, ...publicState() });
        return;
      }

      case "fireBeaconsNow": {
        if (!pollutionSurfacesArmed()) {
          reply({ ok: false, error: "pollution_inactive", count: 0 });
          return;
        }
        const result = await queueChaffToActiveTab();
        reply({ ok: true, count: result.queued });
        return;
      }

      case "chaffFired": {
        const n = typeof msg.count === "number" ? msg.count : 0;
        PERSONA_STATE.stats.fakeBeaconsFired += n;
        await persistPersonaStats();
        reply({ ok: true });
        return;
      }

      case "domChaffApplied": {
        const n = typeof msg.count === "number" ? msg.count : 0;
        PERSONA_STATE.stats.domChaffApplied += n;
        await persistPersonaStats();
        reply({ ok: true });
        return;
      }

      case "checkSiteOverride": {
        // Disabled when Pollution inactive globally OR this hostname is
        // on the per-site Native-Compatible map (or global escape is on).
        const hostname = msg.hostname || "";
        const disabled =
          !pollutionSurfacesArmed() || siteIsNativeCompat(hostname);
        reply({ ok: true, disabled });
        return;
      }

      case "cleanCookiesNow": {
        const result = await cleanTrackerCookies();
        reply({
          ok: !result.error,
          cleaned: result.cleaned || 0,
          scanned: result.scanned || 0,
          matched: result.matched || 0,
          error: result.error || null,
          ...publicState(),
        });
        return;
      }

      default:
        reply({ ok: false, error: "unknown_type" });
    }
  })().catch((err) => {
    reply({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  });

  return true;
});
