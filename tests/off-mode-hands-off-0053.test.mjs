/**
 * 0053: off mode leaves prefs alone (Fable QA B5).
 *
 *   Homogeneous (off) writes nothing: no privacy.* / webgl.* / gfx.* /
 *   librewolf.* user values, no darkstr.pollutionActive=false.
 *   Entering Pollution saves the user's RFP / FPP / librewolf.webgl.prompt
 *   state (user value or none) once; leaving restores exactly that.
 *   WebGL is unlocked only under Pollution and only through the LibreWolf
 *   prompt gate: never webgl.force-enabled, gfx.blocklist.all or forbid-*.
 *   librewolf.cfg no longer carries the darkstr-0029-webgl block.
 *   Profiles a pre-0053 build ran are migrated once (clear-only).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// 0053r2 (Proof: ETP-interaction flag) ships ModeXor from patches/0053r2-files.
// 0057r2 (baseline FPP under Pollution) ships the newest ModeXor from patches/0057-files.
const F53 = ["0058-files", "0057c-files", "0057-files", "0053r2-files", "0053-files"].map((d) => join(root, "patches", d)).find((d) => existsSync(join(d, "DarkstrModeXor.sys.mjs")));

// ------------------------------------------------- Gecko-like pref store ---
// Default branch + user branch. Like libpref, setting a user value equal to
// the default removes the user value (that is what lands in prefs.js).
const PREF_INVALID = 0;
const PREF_STRING = 32;
const PREF_INT = 64;
const PREF_BOOL = 128;
const defaults = new Map();
const user = new Map();
const observers = [];
const writes = []; // every user-branch mutation: [op, name, value]
const typeOf = (v) => (typeof v === "boolean" ? PREF_BOOL : typeof v === "number" ? PREF_INT : PREF_STRING);
function get(k, d) {
  if (user.has(k)) return user.get(k);
  if (defaults.has(k)) return defaults.get(k);
  if (d === undefined) throw new Error(`NS_ERROR_UNEXPECTED: ${k}`);
  return d;
}
function notify(k) {
  for (const [name, o] of observers.slice()) {
    if (k.startsWith(name)) (typeof o === "function" ? o : o.observe.bind(o))(null, "nsPref:changed", k);
  }
}
function setUser(k, v) {
  writes.push(["set", k, v]);
  const before = get(k, null);
  if (defaults.has(k) && defaults.get(k) === v) user.delete(k);
  else user.set(k, v);
  if (before !== v) notify(k);
}
const prefs = {
  PREF_INVALID, PREF_STRING, PREF_INT, PREF_BOOL,
  getBoolPref: get, getIntPref: get, getStringPref: get, getCharPref: get,
  setBoolPref: setUser, setIntPref: setUser, setStringPref: setUser, setCharPref: setUser,
  prefHasUserValue: (k) => user.has(k),
  clearUserPref: (k) => {
    writes.push(["clear", k]);
    const had = user.has(k);
    const before = get(k, null);
    user.delete(k);
    if (had && before !== get(k, null)) notify(k);
  },
  getPrefType: (k) => (user.has(k) ? typeOf(user.get(k)) : defaults.has(k) ? typeOf(defaults.get(k)) : PREF_INVALID),
  prefIsLocked: () => false,
  lockPref() { throw new Error("0053: never lock"); },
  unlockPref() { throw new Error("0053: never unlock"); },
  addObserver: (k, o) => observers.push([k, o]),
  removeObserver: (k, o) => {
    const i = observers.findIndex(([a, b]) => a === k && b === o);
    if (i !== -1) observers.splice(i, 1);
  },
};
const idle = [];
globalThis.Services = {
  // 0055: personas derive their Firefox version from the engine.
  appinfo: { version: "156.0.1", name: "LibreWolf" },
  prefs,
  tm: { dispatchToMainThread: (f) => idle.push(f), idleDispatchToMainThread: (f) => idle.push(f) },
  obs: { addObserver() {}, removeObserver() {}, notifyObservers() {} },
};
globalThis.ChromeUtils = { importESModule() { throw new Error("not in node"); }, defineESModuleGetters() {} };
globalThis.Ci = { nsIGfxInfo: { FEATURE_WEBGL_OPENGL: 1, FEATURE_WEBGL2: 2 } };
globalThis.Cc = {};
globalThis.Cu = {};

const { DarkstrModeXor: MX } = await import(pathToFileURL(join(F53, "DarkstrModeXor.sys.mjs")));

/** Stock LibreWolf 156 defaults (librewolf.cfg + StaticPrefList), 0053 cfg. */
function freshProfile(userValues = {}) {
  if (MX._inited) MX.uninit();
  defaults.clear();
  user.clear();
  observers.length = 0;
  idle.length = 0;
  for (const [k, v] of Object.entries({
    "darkstr.mode": "homogeneous",
    "darkstr.nativeCompatible": false,
    "darkstr.nativePersonaHooks": false,
    "privacy.resistFingerprinting": true,
    "privacy.fingerprintingProtection": false,
    "privacy.baselineFingerprintingProtection": true,
    "browser.contentblocking.category": "standard",
    "webgl.disabled": false,
    "webgl.force-enabled": false,
    "webgl.forbid-hardware": false,
    "webgl.forbid-software": true,
    "gfx.blocklist.all": 0,
    "librewolf.webgl.prompt": true,
    "librewolf.webgl.prompt.hide": true,
    "privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings": false,
  })) {
    defaults.set(k, v);
  }
  for (const [k, v] of Object.entries(userValues)) user.set(k, v);
  writes.length = 0;
}
/** One browser session: init, deferred re-applies, stock CB settle, shutdown. */
function session({ cbSettle = true } = {}) {
  MX.init();
  for (const f of idle.splice(0)) f();
  for (const f of idle.splice(0)) f();
  if (cbSettle) {
    // LibreWolf's cfg puts the user in "strict" (sets FPP true as a user value).
    setUser("browser.contentblocking.category", "strict");
    setUser("privacy.fingerprintingProtection", true);
  }
  for (const f of idle.splice(0)) f();
  MX.uninit();
}
const userSnapshot = (prefix) =>
  Object.fromEntries([...user].filter(([k]) => prefix.some((p) => k.startsWith(p))).sort());
const OWNED = ["privacy.", "webgl.", "gfx.", "librewolf."];
const darkstrWrites = () => writes.filter(([, k]) => OWNED.some((p) => k.startsWith(p)) || k.startsWith("darkstr."));

// ------------------------------------------------------------ off mode ---
test("off mode, fresh profile: two restarts write nothing (no privacy./webgl./gfx./librewolf. user values)", () => {
  freshProfile();
  for (let i = 0; i < 3; i++) session({ cbSettle: false });
  assert.deepEqual(writes, [], "ModeXor wrote in Homogeneous");
  assert.deepEqual(userSnapshot(OWNED), {});
  assert.deepEqual(userSnapshot(["darkstr."]), {});
});

test("off mode: stock CB 'strict' settle and RFP/FPP observer callbacks are not fought", () => {
  freshProfile();
  for (let i = 0; i < 3; i++) session({ cbSettle: true });
  // Only the stock CB writes (made by the test itself, as LibreWolf would).
  assert.deepEqual(
    darkstrWrites().filter(([, k]) => k !== "privacy.fingerprintingProtection"),
    []
  );
  assert.deepEqual(userSnapshot(["webgl.", "gfx.", "librewolf.", "darkstr."]), {});
  assert.equal(user.has("privacy.resistFingerprinting"), false);
});

test("off mode: a user's RFP=false (and FPP=false, WebGL prefs) survive restarts", () => {
  freshProfile({
    "privacy.resistFingerprinting": false,
    "privacy.fingerprintingProtection": false,
    "webgl.force-enabled": true,
    "webgl.disabled": true,
    "librewolf.webgl.prompt": false,
  });
  const before = userSnapshot(OWNED);
  for (let i = 0; i < 3; i++) session({ cbSettle: false });
  // RFP flips while running (user toggles in about:config) are not fought either.
  MX.init();
  setUser("privacy.resistFingerprinting", true);
  setUser("privacy.resistFingerprinting", false);
  MX.uninit();
  assert.deepEqual(userSnapshot(OWNED), before);
  assert.deepEqual(writes.filter(([, k]) => k !== "privacy.resistFingerprinting"), []);
});

// ------------------------------------------------- Pollution round trip ---
const CASES = {
  "stock (no user values)": {},
  "user RFP=false": { "privacy.resistFingerprinting": false },
  "CB strict (FPP=true user value), RFP stock": { "privacy.fingerprintingProtection": true },
  "user RFP=false + FPP=true": { "privacy.resistFingerprinting": false, "privacy.fingerprintingProtection": true },
  "user already lifted the WebGL prompt": { "librewolf.webgl.prompt": false },
  "0057r2: user turned baseline FPP off": { "privacy.baselineFingerprintingProtection": false },
};
// (A user value equal to the default cannot exist in Gecko: libpref drops it,
// so "explicit RFP=true" is the same state as "no user value".)
for (const [name, start] of Object.entries(CASES)) {
  test(`Pollution on → off restores exactly: ${name}`, () => {
    freshProfile();
    for (const [k, v] of Object.entries(start)) setUser(k, v);
    writes.length = 0;
    const before = userSnapshot(OWNED);
    MX.init();
    setUser("darkstr.mode", "pollution");
    assert.equal(get("privacy.resistFingerprinting"), false);
    assert.equal(get("privacy.fingerprintingProtection"), false);
    assert.equal(get("librewolf.webgl.prompt"), false);
    assert.equal(get("privacy.baselineFingerprintingProtection"), false, "0057r2: baseline FPP off under Pollution");
    assert.ok(user.has("darkstr.xor.savedPrefs"));
    // Restart while in Pollution keeps the original saved state.
    MX.uninit();
    MX.init();
    for (const f of idle.splice(0)) f();
    // CB / user stomps during Pollution are re-asserted (XOR) ...
    setUser("privacy.fingerprintingProtection", true);
    assert.equal(get("privacy.fingerprintingProtection"), false);
    setUser("privacy.baselineFingerprintingProtection", true);
    assert.equal(get("privacy.baselineFingerprintingProtection"), false, "0057r2: baseline stomp re-asserted");
    setUser("darkstr.mode", "homogeneous");
    MX.uninit();
    assert.deepEqual(userSnapshot(OWNED), before, "exact restore");
    assert.equal(user.has("darkstr.xor.savedPrefs"), false, "saved copy forgotten");
    // ... and off mode stays hands-off afterwards.
    writes.length = 0;
    session({ cbSettle: false });
    assert.deepEqual(writes, []);
  });
}

// ------------------------------------------ 0053r2: ETP interaction flag ---
// Stock Gecko, simplified: ContentBlockingPrefs.matchCBCategory moves "strict"
// to "custom" when an FPP/RFP pref leaves the strict set (and back), and
// UrlClassifierExceptionListService sets the interaction flag on ANY category
// change. Both are synchronous pref observers.
const ETP = "privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings";
let stockStrict = null;
function installStockEtpObservers() {
  stockStrict = null;
  prefs.addObserver("privacy.fingerprintingProtection", () => {
    const cat = get("browser.contentblocking.category");
    const fpp = get("privacy.fingerprintingProtection");
    if (cat === "strict" && fpp === false) { stockStrict = true; setUser("browser.contentblocking.category", "custom"); }
    else if (cat === "custom" && fpp === true && stockStrict) { setUser("browser.contentblocking.category", "strict"); }
  });
  prefs.addObserver("browser.contentblocking.category", () => setUser(ETP, true));
}
for (const [label, start] of Object.entries({ "never interacted (default false)": {}, "user had interacted (true)": { [ETP]: true } })) {
  test(`0053r2: Pollution round trip leaves ${ETP.split(".").pop()} as it was: ${label}`, () => {
    freshProfile({ "browser.contentblocking.category": "strict", "privacy.fingerprintingProtection": true, ...start });
    installStockEtpObservers();
    const before = { has: user.has(ETP), v: get(ETP) };
    MX.init();
    setUser("darkstr.mode", "pollution");
    assert.equal(get("browser.contentblocking.category"), "custom", "stock flip happened");
    assert.equal(get(ETP), true, "stock observer set the flag during Pollution");
    assert.ok(JSON.parse(get("darkstr.xor.savedPrefs")).prefs[ETP], "pre-Pollution state saved");
    setUser("darkstr.mode", "homogeneous");
    assert.equal(get("browser.contentblocking.category"), "strict", "stock flip back happened");
    for (const f of idle.splice(0)) f();
    MX.uninit();
    assert.deepEqual({ has: user.has(ETP), v: get(ETP) }, before);
    assert.equal(user.has("darkstr.xor.savedPrefs"), false);
  });
}
test("0053r2: a deferred stock re-match after leaving is undone once (idle pass)", () => {
  freshProfile({ "browser.contentblocking.category": "strict", "privacy.fingerprintingProtection": true });
  installStockEtpObservers();
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("darkstr.mode", "homogeneous");
  setUser(ETP, true); // late category re-match before the idle pass
  for (const f of idle.splice(0)) f();
  MX.uninit();
  assert.equal(user.has(ETP), false);
});
test("0053r2: Pollution entered under 0053 (saved state without the flag) leaves the flag alone", () => {
  freshProfile({ "darkstr.mode": "pollution", [ETP]: true,
    "darkstr.xor.savedPrefs": JSON.stringify({ v: 1, prefs: { "privacy.resistFingerprinting": { user: false, value: null } } }) });
  MX.init();
  setUser("darkstr.mode", "homogeneous");
  for (const f of idle.splice(0)) f();
  MX.uninit();
  assert.equal(get(ETP), true, "unknown pre-Pollution state: not guessed");
});
test("0053r2: off mode still writes nothing (flag never touched)", () => {
  freshProfile();
  for (let i = 0; i < 3; i++) session({ cbSettle: false });
  assert.deepEqual(writes, []);
});

test("Pollution never touches webgl.force-enabled / gfx.blocklist.all / forbid-* / prompt.hide", () => {
  freshProfile({ "darkstr.mode": "pollution", "darkstr.nativePersonaHooks": true });
  session();
  for (const k of ["webgl.force-enabled", "gfx.blocklist.all", "webgl.forbid-hardware", "webgl.forbid-software", "webgl.disabled", "librewolf.webgl.prompt.hide"]) {
    assert.equal(writes.some(([, w]) => w === k), false, k);
    assert.equal(user.has(k), false, k);
  }
  assert.equal(get("librewolf.webgl.prompt"), false, "prompt gate lifted under Pollution");
  assert.equal(get("gfx.blocklist.all"), 0, "GPU blocklist honoured");
  assert.equal(get("webgl.force-enabled"), false);
});

// -------------------------------------------------------------- legacy ---
const LEGACY_0052 = {
  "webgl.forbid-software": false,
  "webgl.force-enabled": true,
  "gfx.blocklist.all": -1,
  "librewolf.webgl.prompt": false,
};
test("legacy profile (pre-0053 build) in off mode: 0029 WebGL values cleared once", () => {
  freshProfile({ ...LEGACY_0052, "darkstr.webgl.lastStatus": "disabled=false,force-enabled=true,blocklist.all=-1" });
  session({ cbSettle: false });
  assert.deepEqual(userSnapshot(["webgl.", "gfx.", "librewolf."]), {});
  assert.equal(user.get("darkstr.xor.migrated0053"), true);
  // Later, the user sets one of them on purpose: never cleared again.
  user.set("webgl.forbid-software", false);
  writes.length = 0;
  session({ cbSettle: false });
  session({ cbSettle: false });
  assert.equal(user.get("webgl.forbid-software"), false);
  assert.deepEqual(writes, []);
});

test("legacy profile in Pollution (RFP=false forced by the old build): exit restores stock", () => {
  freshProfile({
    "darkstr.mode": "pollution",
    "privacy.resistFingerprinting": false,
    "privacy.fingerprintingProtection": false,
    "webgl.forbid-software": false,
  });
  MX.init();
  assert.equal(get("privacy.resistFingerprinting"), false);
  setUser("darkstr.mode", "homogeneous");
  MX.uninit();
  assert.deepEqual(userSnapshot(OWNED), {}, "back to stock LibreWolf");
});

test("fresh profile never gets the migration marker or saved state in off mode", () => {
  freshProfile();
  session();
  assert.equal(user.has("darkstr.xor.migrated0053"), false);
  assert.equal(user.has("darkstr.xor.savedPrefs"), false);
});

// -------------------------------------------------------------- static ---
test("librewolf.cfg: darkstr-0029-webgl block removed; no WebGL / blocklist overrides", () => {
  const cfg = readFileSync(join(root, "patches/0053-files/librewolf.cfg"), "utf8");
  assert.doesNotMatch(cfg, /darkstr-0029-webgl/);
  for (const k of ["webgl.force-enabled", "gfx.blocklist.all", "librewolf.webgl.prompt"]) {
    assert.ok(!cfg.includes(`"${k}"`), k);
  }
  assert.match(cfg, /pref\("webgl\.disabled", false\);/, "LibreWolf's own WEBGL section untouched");
  assert.match(cfg, /defaultPref\("privacy\.resistFingerprinting", true\);/);
  assert.match(cfg, /\/\/ END darkstr-m1-prefs\n\n\/\/ BEGIN darkstr-0030-etld-rotate/);
});

test("ModeXor source: no WebGL force / blocklist / lock writes, Homogeneous has no RFP/FPP set", () => {
  const js = readFileSync(join(F53, "DarkstrModeXor.sys.mjs"), "utf8");
  assert.doesNotMatch(js, /set\w+Pref\(\s*(WEBGL_FORCE_ENABLED_PREF|GFX_BLOCKLIST_ALL_PREF|WEBGL_FORBID_\w+|WEBGL_DISABLED_PREF|LIBREWOLF_WEBGL_PROMPT_HIDE_PREF)/);
  assert.doesNotMatch(js, /(un)?lockPref\(/);
  assert.doesNotMatch(js, /setBoolPref\(RFP_PREF, true\)|setBoolPref\(FPP_PREF, true\)/);
});

test("NativePersona: darkstr.pollutionActive only written while Pollution is active", () => {
  // Newest shipped copy (0055 carries the same pollutionActive rule).
  const np55 = join(root, "patches/0055-files/DarkstrNativePersona.sys.mjs");
  const np = readFileSync(existsSync(np55) ? np55 : join(F53, "DarkstrNativePersona.sys.mjs"), "utf8");
  assert.match(np, /if \(pollutionActive\) \{\s*Services\.prefs\.setBoolPref\(POLLUTION_ACTIVE_PREF, true\);\s*\} else if \(Services\.prefs\.prefHasUserValue\(POLLUTION_ACTIVE_PREF\)\) \{\s*Services\.prefs\.clearUserPref\(POLLUTION_ACTIVE_PREF\);/);
  assert.doesNotMatch(np, /setBoolPref\(POLLUTION_ACTIVE_PREF, !!pollutionActive\)/);
});

// ------------------------------------------- 0057r2: baseline FPP backfill ---
const BASE = "privacy.baselineFingerprintingProtection";
test("0057r2: Pollution entered under an older build: baseline FPP recorded on next start, restored exactly", () => {
  for (const startBase of [undefined, false]) {
    const old = { v: 1, prefs: { "privacy.resistFingerprinting": { user: false, value: null },
      "privacy.fingerprintingProtection": { user: false, value: null }, "librewolf.webgl.prompt": { user: false, value: null } } };
    freshProfile({ "darkstr.mode": "pollution", "privacy.resistFingerprinting": false, "librewolf.webgl.prompt": false,
      ...(startBase === undefined ? {} : { [BASE]: startBase }), "darkstr.xor.savedPrefs": JSON.stringify(old) });
    MX.init();
    const saved = JSON.parse(get("darkstr.xor.savedPrefs"));
    assert.deepEqual(saved.prefs[BASE], startBase === undefined ? { user: false, value: null } : { user: true, value: false });
    assert.deepEqual(saved.prefs["privacy.resistFingerprinting"], old.prefs["privacy.resistFingerprinting"], "RFP record never rewritten");
    assert.equal(get(BASE), false);
    setUser("darkstr.mode", "homogeneous");
    for (const f of idle.splice(0)) f();
    MX.uninit();
    assert.equal(user.has(BASE), startBase !== undefined, "baseline back to its pre-Pollution state");
    assert.equal(get(BASE), startBase === undefined ? true : false);
  }
});
test("0057r2: off mode never touches baseline FPP (user off or stock on)", () => {
  for (const v of [undefined, false]) {
    freshProfile(v === undefined ? {} : { [BASE]: v });
    for (let i = 0; i < 3; i++) session({ cbSettle: false });
    MX.init(); setUser(BASE, true); setUser(BASE, false); MX.uninit();
    assert.deepEqual(writes.filter(([, k]) => k !== BASE), []);
  }
});
test("0057r2: xorSafe requires baseline FPP off under Pollution", () => {
  freshProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  assert.equal(MX.applyModeEffects().xorSafe, true);
  setUser("darkstr.mode", "homogeneous");
  MX.uninit();
});

// ------------------------- 0057c: contentblocking category re-match ---
// Stock Gecko, faithfully: matchCBCategory() picks the first category whose
// prefsMatch() holds, else "custom"; prefsMatch() rejects every category while
// the category pref has another user value, so "custom" never goes back at
// runtime (only LibreWolf's cfg re-sets "strict" at startup).
const CBP_STRICT = {
  "privacy.fingerprintingProtection": true,
  "network.cookie.cookieBehavior": 5,
  "privacy.trackingprotection.allow_list.baseline.enabled": true,
  "privacy.annotate_channels.strict_list.enabled": null,
};
function installRealisticCB() {
  defaults.set("network.cookie.cookieBehavior", 5);
  defaults.set("privacy.trackingprotection.allow_list.baseline.enabled", true);
  const cbp = {
    PREF_CB_CATEGORY: "browser.contentblocking.category",
    PREF_ALLOW_LIST_BASELINE: "privacy.trackingprotection.allow_list.baseline.enabled",
    PREF_ALLOW_LIST_CONVENIENCE: "privacy.trackingprotection.allow_list.convenience.enabled",
    CATEGORY_PREFS: { strict: CBP_STRICT, standard: { "privacy.fingerprintingProtection": null, "network.cookie.cookieBehavior": null } },
    switchingCategory: false,
    switchLog: [],
    prefsMatch(cat) {
      if (user.has(this.PREF_CB_CATEGORY) && get(this.PREF_CB_CATEGORY) != cat) return false;
      for (const [k, v] of Object.entries(this.CATEGORY_PREFS[cat])) {
        if (k === this.PREF_ALLOW_LIST_BASELINE) continue;
        if (v == null) { if (user.has(k)) return false; }
        else if (prefs.getPrefType(k) && get(k) != v) return false;
      }
      return true;
    },
    matchCBCategory() {
      if (this.switchingCategory) return;
      for (const c of ["standard", "strict"]) if (this.prefsMatch(c)) { setUser(this.PREF_CB_CATEGORY, c); return; }
      setUser(this.PREF_CB_CATEGORY, "custom");
    },
  };
  for (const k of ["privacy.fingerprintingProtection", "network.cookie.cookieBehavior"]) prefs.addObserver(k, () => cbp.matchCBCategory());
  prefs.addObserver("browser.contentblocking.category", () => {
    cbp.switchLog.push([get("browser.contentblocking.category"), cbp.switchingCategory]);
    setUser(ETP, true);
  });
  MX._cbPrefsForTest = cbp;
  return cbp;
}
function cbProfile(extra = {}) {
  freshProfile({ "browser.contentblocking.category": "strict", "privacy.fingerprintingProtection": true, ...extra });
  return installRealisticCB();
}
test("0057c: leaving Pollution re-matches the category to strict in the idle pass (no restart), flag exact", () => {
  const cbp = cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  assert.equal(get("browser.contentblocking.category"), "custom", "stock flip on FPP=false");
  assert.deepEqual(JSON.parse(get("darkstr.xor.savedPrefs")).prefs["browser.contentblocking.category"], { user: true, value: "strict" });
  setUser("darkstr.mode", "homogeneous");
  assert.equal(get("privacy.fingerprintingProtection"), true, "FPP restored");
  assert.equal(get("browser.contentblocking.category"), "custom", "stock alone stays custom (the lag)");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "strict", "re-matched without a restart");
  assert.equal(MX._lastCategoryRematch, "rematched:strict");
  assert.deepEqual(cbp.switchLog.at(-1), ["strict", true], "set under switchingCategory");
  assert.equal(cbp.switchingCategory, false, "switchingCategory reset");
  assert.equal(user.has(ETP), false, "ETP interaction flag back to its pre-Pollution state");
  assert.equal(user.has("darkstr.xor.savedPrefs"), false);
  MX.uninit();
});
test("0057c: user-valued ETP flag stays true; standard user category re-matched too", () => {
  freshProfile({ [ETP]: true, "browser.contentblocking.category": "standard" });
  installRealisticCB();
  MX.init();
  setUser("darkstr.mode", "pollution");
  // (FPP's default is false here, so simulate the stock flip directly.)
  setUser("browser.contentblocking.category", "custom");
  setUser("darkstr.mode", "homogeneous");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "standard");
  assert.equal(get(ETP), true);
  MX.uninit();
});
test("0057c: category the user changed after leaving is left alone", () => {
  cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("darkstr.mode", "homogeneous");
  setUser("browser.contentblocking.category", "standard");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "standard");
  assert.equal(MX._lastCategoryRematch, "left");
  MX.uninit();
});
test("0057c: prefs that no longer fit strict keep custom", () => {
  cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("network.cookie.cookieBehavior", 1); // user customised during Pollution
  setUser("darkstr.mode", "homogeneous");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "custom");
  assert.equal(MX._lastCategoryRematch, "no-fit");
  assert.equal(get("network.cookie.cookieBehavior"), 1, "no pref rewritten");
  MX.uninit();
});
test("0057c: a saved custom category, or an older saved copy without the record, is not re-matched", () => {
  cbProfile({ "browser.contentblocking.category": "custom" });
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("darkstr.mode", "homogeneous");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "custom");
  MX.uninit();
  cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  const saved = JSON.parse(get("darkstr.xor.savedPrefs"));
  delete saved.prefs["browser.contentblocking.category"];
  setUser("darkstr.xor.savedPrefs", JSON.stringify(saved));
  setUser("darkstr.mode", "homogeneous");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "custom");
  assert.equal(MX._lastCategoryRematch, "no-record");
  MX.uninit();
});
test("0057c: off mode never touches the category or calls ContentBlockingPrefs", () => {
  const cbp = cbProfile();
  writes.length = 0;
  session({ cbSettle: false });
  session({ cbSettle: false });
  assert.deepEqual(cbp.switchLog, []);
  assert.deepEqual(writes.filter(([, k]) => k === "browser.contentblocking.category"), []);
});
test("0057c: re-entering Pollution before the idle pass runs skips the re-match", () => {
  cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("darkstr.mode", "homogeneous");
  const pending = idle.splice(0);
  setUser("darkstr.mode", "pollution");
  for (const f of pending) f();
  assert.equal(get("browser.contentblocking.category"), "custom");
  MX.uninit();
  delete MX._cbPrefsForTest;
});
test("0057c: first start already in Pollution (FPP saved before CB applied strict): own prefs fixed, strict re-matched", () => {
  // librewolf.cfg put "strict" in place, but ContentBlockingPrefs had not yet
  // set FPP when ModeXor saved its state: FPP has no user value (default false).
  const cbp = cbProfile();
  user.delete("privacy.fingerprintingProtection");
  user.set("network.cookie.cookieBehavior", 5);
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("browser.contentblocking.category", "custom");
  assert.deepEqual(JSON.parse(get("darkstr.xor.savedPrefs")).prefs["privacy.fingerprintingProtection"], { user: false, value: null });
  setUser("darkstr.mode", "homogeneous");
  assert.equal(get("privacy.fingerprintingProtection"), false, "restored exactly (no user value)");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "strict");
  assert.equal(get("privacy.fingerprintingProtection"), true, "strict's value, as the next start would set it");
  assert.match(MX._lastCategoryRematch, /^rematched:strict\+own$/);
  assert.equal(cbp.switchingCategory, false);
  assert.equal(user.has(ETP), false);
  MX.uninit();
});
test("0057c: a non-ModeXor pref mismatch still blocks the re-match (no-fit), nothing rewritten", () => {
  cbProfile();
  MX.init();
  setUser("darkstr.mode", "pollution");
  setUser("network.cookie.cookieBehavior", 1);
  prefs.clearUserPref("privacy.fingerprintingProtection");
  setUser("darkstr.mode", "homogeneous");
  const fppBefore = get("privacy.fingerprintingProtection");
  for (const f of idle.splice(0)) f();
  assert.equal(get("browser.contentblocking.category"), "custom");
  assert.equal(MX._lastCategoryRematch, "no-fit");
  assert.equal(get("privacy.fingerprintingProtection"), fppBefore, "own prefs not touched when blocked");
  MX.uninit();
});
test("0057c: patch artifacts — SHA256SUMS, base pinned to 0057-files, apply script wiring", async () => {
  const { createHash } = await import("node:crypto");
  const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
  const [h, n] = readFileSync(join(root, "patches/0057c-files/SHA256SUMS"), "utf8").trim().split(/\s+/);
  assert.equal(n, "DarkstrModeXor.sys.mjs");
  assert.equal(sha("patches/0057c-files/DarkstrModeXor.sys.mjs"), h);
  const [bh] = readFileSync(join(root, "patches/0057c-files/BASE_SHA256SUMS"), "utf8").trim().split(/\s+/);
  assert.equal(sha("patches/0057-files/DarkstrModeXor.sys.mjs"), bh);
  const sh = readFileSync(join(root, "scripts/apply-0057c-cb-category-mini.sh"), "utf8");
  assert.match(sh, /0057c-darkstr-cb-category-rematch\.patch/);
  assert.match(sh, /obj-aarch64-apple-darwin25\.6\.0/);
  assert.doesNotMatch(sh.split("\n").filter((l) => !l.startsWith("#")).join("\n"), /\bmv\b/);
});
