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
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F53 = join(root, "patches/0053-files");

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
    "browser.contentblocking.category": "standard",
    "webgl.disabled": false,
    "webgl.force-enabled": false,
    "webgl.forbid-hardware": false,
    "webgl.forbid-software": true,
    "gfx.blocklist.all": 0,
    "librewolf.webgl.prompt": true,
    "librewolf.webgl.prompt.hide": true,
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
    assert.ok(user.has("darkstr.xor.savedPrefs"));
    // Restart while in Pollution keeps the original saved state.
    MX.uninit();
    MX.init();
    for (const f of idle.splice(0)) f();
    // CB / user stomps during Pollution are re-asserted (XOR) ...
    setUser("privacy.fingerprintingProtection", true);
    assert.equal(get("privacy.fingerprintingProtection"), false);
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
  const cfg = readFileSync(join(F53, "librewolf.cfg"), "utf8");
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
  const np = readFileSync(join(F53, "DarkstrNativePersona.sys.mjs"), "utf8");
  assert.match(np, /if \(pollutionActive\) \{\s*Services\.prefs\.setBoolPref\(POLLUTION_ACTIVE_PREF, true\);\s*\} else if \(Services\.prefs\.prefHasUserValue\(POLLUTION_ACTIVE_PREF\)\) \{\s*Services\.prefs\.clearUserPref\(POLLUTION_ACTIVE_PREF\);/);
  assert.doesNotMatch(np, /setBoolPref\(POLLUTION_ACTIVE_PREF, !!pollutionActive\)/);
});
