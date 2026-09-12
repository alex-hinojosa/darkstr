/**
 * darkstr Phase 1 background (Firefox event page — not a Chrome service worker).
 *
 * Owns XOR mode prefs, session persona seed, MAIN-world bootstrap inject,
 * success-driven tab-scoped UA/CH DNR, and pollution-gated chaff.
 *
 * Scripts loaded via manifest background.scripts (no importScripts):
 *   lib/prefs.js, lib/modes.js, lib/profiles.js, poisoner.js,
 *   anti-fingerprint-bootstrap.js, background.js
 */
"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;

const UA_SESSION_RULE_ID = 9001;
const CHAFF_ALARM = "firePoisonBeacons";
const ROTATE_ALARM = "rotateIdentity";

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
  },
};

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
    PERSONA_STATE.chaosLevel = raw["darkstr.chaosLevel"];
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

async function rotateIdentity(reloadTabs) {
  const seed = generateSessionSeed();
  const profile = generateProfile(seed);
  PERSONA_STATE.sessionSeed = seed;
  PERSONA_STATE.profile = profile;
  PERSONA_STATE.bootstrappedTabs.clear();
  PERSONA_STATE.bootstrappedDocs.clear();
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
        (tabs || []).map((t) =>
          B.tabs.reload(t.id).catch(() => {})
        )
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
  try {
    await B.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [UA_SESSION_RULE_ID],
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
  if (!pollutionSurfacesArmed()) return;
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
    await updateTabScopedUaDnr();
  } catch (err) {
    PERSONA_STATE.bootstrappedTabs.delete(tabId);
    await updateTabScopedUaDnr();
    console.warn("darkstr MAIN inject skipped:", err && err.message);
  }
}

async function revokeBootstrap(tabId) {
  if (!PERSONA_STATE.bootstrappedTabs.has(tabId)) return;
  PERSONA_STATE.bootstrappedTabs.delete(tabId);
  for (const key of [...PERSONA_STATE.bootstrappedDocs]) {
    if (key.startsWith(`${tabId}:`)) PERSONA_STATE.bootstrappedDocs.delete(key);
  }
  await updateTabScopedUaDnr();
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
    await clearTabScopedUaDnr();
    try {
      await B.alarms.clear(CHAFF_ALARM);
      await B.alarms.clear(ROTATE_ALARM);
    } catch (_) {}
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

function publicState() {
  return {
    prefs: STATE.prefs,
    activation: STATE.activation,
    rfp: STATE.lastRfp,
    profile: pollutionSurfacesArmed() ? PERSONA_STATE.profile : null,
    chaosLevel: PERSONA_STATE.chaosLevel,
    stats: PERSONA_STATE.stats,
    host: typeof DARKSTR_HOST !== "undefined" ? DARKSTR_HOST : null,
    product: {
      name: "darkstr",
      phase: "1",
      positioning:
        "Pollution tool. Not an anti-detect browser. Not a Cloudflare bypass. Not official LibreWolf.",
    },
  };
}

// === Navigation: success-driven MAIN inject ===
B.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await revokeBootstrap(details.tabId);
});

B.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  for (const key of [...PERSONA_STATE.bootstrappedDocs]) {
    if (key.startsWith(`${details.tabId}:`)) {
      PERSONA_STATE.bootstrappedDocs.delete(key);
    }
  }
  if (PERSONA_STATE.bootstrappedTabs.has(details.tabId)) {
    PERSONA_STATE.bootstrappedTabs.delete(details.tabId);
    updateTabScopedUaDnr();
  }
  if (!pollutionSurfacesArmed()) return;
  injectPersona(details.tabId, details.url);
});

B.tabs.onRemoved.addListener((tabId) => {
  revokeBootstrap(tabId);
});

B.alarms.onAlarm.addListener(async (alarm) => {
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
        const level = msg.level;
        if (level !== "stealth" && level !== "balanced" && level !== "chaos") {
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
        // Phase 1: global Native-Compatible only — no per-host map yet.
        // bridge.js still asks; reply is a no-op acknowledge.
        reply({ ok: true, disabled: !pollutionSurfacesArmed() });
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
