/**
 * Phase 2 prefs bridge — WebExt ↔ chrome Proof-pin sync (unit / fixture).
 *
 * Does NOT claim live Proof XOR on a Mini binary. Tests schema + glue
 * contracts and soft no-op when browser.darkstrPrefs is absent (stock path).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadPrefBridge({ darkstrPrefs } = {}) {
  const src = readFileSync(join(root, "extension/lib/pref-bridge.js"), "utf8");
  const browser = {};
  if (darkstrPrefs) {
    browser.darkstrPrefs = darkstrPrefs;
  }
  const sand = { globalThis: { browser } };
  // eslint-disable-next-line no-new-func
  Function(
    "globalThis",
    "browser",
    "chrome",
    src +
      `\nreturn {
        PREF_BRIDGE_KEYS,
        PREF_BRIDGE_STATE,
        pickBridgePrefs,
        getDarkstrPrefsApi,
        isPrefBridgeAvailable,
        pushPrefsToChrome,
        pullPrefsFromChrome,
        syncChromeAuthoritativeOnStartup,
        bindChromePrefListener,
        initPrefBridge,
      };`
  )(sand.globalThis, browser, undefined);
  return { api: sand.globalThis, browser };
}

test("PREF_BRIDGE_KEYS are Proof-pin only (no privacy.*)", () => {
  const { api } = loadPrefBridge();
  assert.deepEqual([...api.PREF_BRIDGE_KEYS], [
    "darkstr.mode",
    "darkstr.nativeCompatible",
    "darkstr.nativeCompatSites",
    "darkstr.strictFirstDoc",
    "darkstr.nativePersonaHooks",
  ]);
  for (const k of api.PREF_BRIDGE_KEYS) {
    assert.ok(k.startsWith("darkstr."));
    assert.doesNotMatch(k, /^privacy\./);
  }
});

test("pickBridgePrefs drops non-bridge keys", () => {
  const { api } = loadPrefBridge();
  const picked = api.pickBridgePrefs({
    "darkstr.mode": "pollution",
    "darkstr.nativePersonaHooks": false,
    "darkstr.firstRunDone": true,
    "privacy.resistFingerprinting": false,
  });
  assert.deepEqual(picked, {
    "darkstr.mode": "pollution",
    "darkstr.nativePersonaHooks": false,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(picked, "privacy.resistFingerprinting"), false);
});

test("stock path: no darkstrPrefs → unavailable soft no-op", async () => {
  const { api } = loadPrefBridge();
  assert.equal(api.getDarkstrPrefsApi(), null);
  assert.equal(await api.isPrefBridgeAvailable(), false);
  const push = await api.pushPrefsToChrome({ "darkstr.mode": "pollution" });
  assert.equal(push.ok, false);
  assert.equal(push.reason, "unavailable");
  const pull = await api.pullPrefsFromChrome();
  assert.equal(pull.ok, false);
  assert.equal(pull.reason, "unavailable");
  const init = await api.initPrefBridge({
    savePrefs: async () => {
      throw new Error("should not save on stock");
    },
  });
  assert.equal(init.ok, false);
  assert.equal(init.reason, "unavailable");
});

test("fork path: push/pull + chrome-authoritative startup", async () => {
  let chromeStore = {
    "darkstr.mode": "homogeneous",
    "darkstr.nativeCompatible": false,
    "darkstr.nativeCompatSites": {},
    "darkstr.strictFirstDoc": true,
    "darkstr.nativePersonaHooks": false,
  };
  const listeners = [];
  const darkstrPrefs = {
    async isAvailable() {
      return true;
    },
    async getAll() {
      return { ...chromeStore };
    },
    async setPrefs(partial) {
      chromeStore = { ...chromeStore, ...partial };
      return { ...chromeStore };
    },
    onChanged: {
      addListener(fn) {
        listeners.push(fn);
      },
    },
  };

  const { api } = loadPrefBridge({ darkstrPrefs });
  assert.equal(await api.isPrefBridgeAvailable(), true);

  const pushed = await api.pushPrefsToChrome({
    "darkstr.mode": "pollution",
    "darkstr.nativePersonaHooks": false,
    "darkstr.firstRunDone": true,
  });
  assert.equal(pushed.ok, true);
  assert.equal(chromeStore["darkstr.mode"], "pollution");
  assert.equal(chromeStore["darkstr.nativePersonaHooks"], false);
  assert.equal(Object.prototype.hasOwnProperty.call(chromeStore, "darkstr.firstRunDone"), false);

  chromeStore["darkstr.mode"] = "homogeneous";
  const saved = [];
  const init = await api.initPrefBridge({
    savePrefs: async (partial) => {
      saved.push(partial);
      return partial;
    },
  });
  assert.equal(init.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]["darkstr.mode"], "homogeneous");
  assert.equal(listeners.length, 1);

  // about:config flip → storage mirror
  chromeStore["darkstr.mode"] = "pollution";
  await listeners[0]({
    name: "darkstr.mode",
    prefs: { ...chromeStore },
  });
  assert.equal(saved.at(-1)["darkstr.mode"], "pollution");
});

test("echo guard: syncingFromChrome skips push", async () => {
  let setCalls = 0;
  const darkstrPrefs = {
    async isAvailable() {
      return true;
    },
    async getAll() {
      return {
        "darkstr.mode": "homogeneous",
        "darkstr.nativeCompatible": false,
        "darkstr.nativeCompatSites": {},
        "darkstr.strictFirstDoc": true,
        "darkstr.nativePersonaHooks": false,
      };
    },
    async setPrefs(partial) {
      setCalls += 1;
      return partial;
    },
    onChanged: { addListener() {} },
  };
  const { api } = loadPrefBridge({ darkstrPrefs });
  api.PREF_BRIDGE_STATE.syncingFromChrome = true;
  const r = await api.pushPrefsToChrome({ "darkstr.mode": "pollution" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "echo_guard");
  assert.equal(setCalls, 0);
});

test("experiment schema and api.js are Proof-pin only; hooks default-off", () => {
  const schema = readFileSync(
    join(root, "extension/experiments/darkstr_prefs/schema.json"),
    "utf8"
  );
  const apiJs = readFileSync(
    join(root, "extension/experiments/darkstr_prefs/api.js"),
    "utf8"
  );
  const manifest = JSON.parse(
    readFileSync(join(root, "extension/manifest.json"), "utf8")
  );

  assert.ok(manifest.experiment_apis?.darkstrPrefs);
  assert.equal(
    manifest.experiment_apis.darkstrPrefs.schema,
    "experiments/darkstr_prefs/schema.json"
  );
  assert.match(schema, /darkstr\.mode/);
  assert.match(schema, /darkstr\.nativePersonaHooks/);
  assert.doesNotMatch(schema, /privacy\.resistFingerprinting/);
  assert.doesNotMatch(schema, /privacy\.fingerprintingProtection/);
  assert.match(apiJs, /Services\.prefs\.setStringPref/);
  assert.match(apiJs, /Services\.prefs\.setBoolPref/);
  assert.match(apiJs, /HOOKS_PREF, partial\[HOOKS_PREF\] === true/);
  assert.match(apiJs, /Default-off/);
  assert.doesNotMatch(apiJs, /setBoolPref\(\s*["']privacy\./);
  assert.match(apiJs, /not Cloudflare bypass/i);
});

test("manifest loads pref-bridge.js before modes; background wires bridge", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "extension/manifest.json"), "utf8")
  );
  const scripts = manifest.background.scripts;
  const prefsIdx = scripts.indexOf("lib/prefs.js");
  const bridgeIdx = scripts.indexOf("lib/pref-bridge.js");
  const modesIdx = scripts.indexOf("lib/modes.js");
  assert.ok(prefsIdx >= 0 && bridgeIdx > prefsIdx && modesIdx > bridgeIdx);

  const bg = readFileSync(join(root, "extension/background.js"), "utf8");
  assert.match(bg, /pushPrefsToChrome/);
  assert.match(bg, /initPrefBridge/);
  assert.match(bg, /prefBridgeAvailable/);
});

test("PREF-BRIDGE.md marks WebExt mirror sync as shipped (soft honesty)", () => {
  const doc = readFileSync(join(root, "docs/PREF-BRIDGE.md"), "utf8");
  assert.match(doc, /experiments\/darkstr_prefs|browser\.darkstrPrefs|pref-bridge/);
  assert.match(doc, /chrome authoritative|chrome prefs are authoritative|Chrome is authoritative/i);
  assert.match(doc, /storage-only/i);
  assert.doesNotMatch(doc, /WebExt mirror sync \| Builder \(M2\+\) \| storage ↔ chrome; fork-only privileged API — deferred/);
});
