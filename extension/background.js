/**
 * darkstr Phase 1 background (Firefox event page, not a Chrome service worker).
 *
 * Owns XOR mode prefs, DNR enablement, first-run, and the injection gate.
 * Does NOT ship the Duppel MAIN-world persona bootstrap yet — that is the
 * Phase 1 port target (see docs/PORT-MAP.md).
 */
"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;

const STATE = {
  prefs: normalizeDarkstrPrefs(DARKSTR_DEFAULTS),
  activation: null,
  lastRfp: { likelyRfp: false, timeZone: null },
};

async function loadPrefs() {
  const raw = await B.storage.local.get(Object.values(DARKSTR_PREF));
  STATE.prefs = normalizeDarkstrPrefs(raw);
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
    // Missing host permission or privileged page — keep last probe.
    console.warn("darkstr rfp probe skipped:", err && err.message);
  }
  return STATE.lastRfp;
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

  const enableDnr = STATE.activation.allowDnrTrackingRules;
  try {
    await B.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableDnr ? ["tracking_rules"] : [],
      disableRulesetIds: enableDnr ? [] : ["tracking_rules"],
    });
  } catch (err) {
    console.warn("darkstr DNR ruleset update failed:", err && err.message);
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
  } catch (_) {
    /* badge is optional */
  }

  return STATE.activation;
}

function publicState() {
  return {
    prefs: STATE.prefs,
    activation: STATE.activation,
    rfp: STATE.lastRfp,
    product: {
      name: "darkstr",
      phase: "1",
      positioning:
        "Pollution tool. Not an anti-detect browser. Not a Cloudflare bypass. Not official LibreWolf.",
    },
  };
}

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

loadPrefs().then(applyActivation).catch((err) => {
  console.error("darkstr init failed:", err);
});

B.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = (value) => {
    try {
      sendResponse(value);
    } catch (_) {
      /* port closed */
    }
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
        // Must be invoked from a user-gesture page (first-run / popup).
        const granted = await B.permissions.request({ origins: ["<all_urls>"] });
        await savePrefs({ [DARKSTR_PREF.HOST_PERMS_OK]: granted === true });
        reply({ ok: true, granted: granted === true, ...publicState() });
        return;
      }

      case "checkHostPermissions": {
        const granted = await B.permissions.contains({ origins: ["<all_urls>"] });
        reply({ ok: true, granted: granted === true });
        return;
      }

      default:
        reply({ ok: false, error: "unknown_type" });
    }
  })().catch((err) => {
    reply({ ok: false, error: String(err && err.message ? err.message : err) });
  });

  return true;
});
