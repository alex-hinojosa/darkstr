/**
 * 0054 (Fable B6): Pollution requires native persona hooks. "Pollution on, hooks off" cannot be reached from
 * the Settings pane (choosing Pollution turns hooks on first), and ModeXor refuses it from any other writer
 * (startup prefs, about:config, runtime changes): darkstr.mode goes back to Homogeneous before any RFP/FPP
 * write. Native-Compatible stays the documented escape. Runs the real patches/0054-files modules against a
 * Gecko-like pref store (same as tests/off-mode-hands-off-0053).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(root, "patches", "0054-files");
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

const { DarkstrModeXor: MX } = await import(pathToFileURL(join(F, "DarkstrModeXor.sys.mjs")));
const RFP = "privacy.resistFingerprinting", FPP = "privacy.fingerprintingProtection";
const MODE = "darkstr.mode", HOOKS = "darkstr.nativePersonaHooks", NC = "darkstr.nativeCompatible";

function freshProfile(userValues = {}, defaultOverrides = {}) {
  if (MX._inited) MX.uninit();
  defaults.clear(); user.clear(); observers.length = 0; idle.length = 0; MX._refusals = 0;
  for (const [k, v] of Object.entries({
    [MODE]: "homogeneous", [NC]: false, [HOOKS]: false,
    [RFP]: true, [FPP]: false, "privacy.baselineFingerprintingProtection": true,
    "privacy.fingerprintingProtection.pbmode": true, "privacy.resistFingerprinting.pbmode": false,
    "browser.contentblocking.category": "standard", "webgl.disabled": false, "webgl.forbid-software": true,
    "librewolf.webgl.prompt": true, "privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings": false,
    ...defaultOverrides,
  })) defaults.set(k, v);
  for (const [k, v] of Object.entries(userValues)) user.set(k, v);
  writes.length = 0;
}
const drain = () => { for (let i = 0; i < 4; i++) for (const f of idle.splice(0)) f(); };
const state = () => ({ mode: get(MODE), hooks: get(HOOKS), nc: get(NC), rfp: get(RFP), fpp: get(FPP) });
// persona applied = Pollution + hooks without Native-Compatible (DarkstrNativePersona applyNativeBase);
// NC = the documented escape (Pollution + hooks + nativeCompatible: RFP off, native identity).
const invariant = (s, where) => {
  assert.ok(!(s.mode === "pollution" && !s.hooks), `${where}: Pollution with hooks off ${JSON.stringify(s)}`);
  if (s.rfp === false) {
    const persona = s.mode === "pollution" && s.hooks && !s.nc;
    const ncEscape = s.mode === "pollution" && s.hooks && s.nc;
    assert.ok(persona || ncEscape, `${where}: RFP off without a persona ${JSON.stringify(s)}`);
  }
};
const B = [false, true];

test("0054: startup -- every mode x hooks x NC hand-edited combination ends coherent", () => {
  for (const mode of ["homogeneous", "pollution"]) for (const hooks of B) for (const nc of B) {
    freshProfile({ [MODE]: mode, [HOOKS]: hooks, [NC]: nc });
    MX.init(); drain();
    const s = state(), where = `start ${mode}/${hooks}/${nc}`;
    invariant(s, where);
    if (mode === "pollution" && hooks) {
      assert.equal(s.mode, "pollution", where); assert.equal(s.rfp, false, where); assert.equal(s.fpp, false, where);
    } else {
      assert.equal(s.mode, "homogeneous", where); assert.equal(s.rfp, true, where);
      assert.equal(user.has(RFP), false, `${where}: RFP untouched`);
    }
    if (mode === "pollution" && !hooks) {
      assert.equal(user.has(MODE), false, `${where}: mode user value cleared (default Homogeneous)`);
      assert.ok(MX._refusals >= 1, where);
      assert.deepEqual(writes.filter(([, k]) => k.startsWith("privacy.")), [], `${where}: no privacy.* write`);
    }
    MX.uninit();
  }
});

test("0054: runtime -- every transition between the 8 states keeps the invariant after each single write", () => {
  const states = [];
  for (const mode of ["homogeneous", "pollution"]) for (const hooks of B) for (const nc of B) states.push({ mode, hooks, nc });
  for (const from of states) for (const to of states) {
    freshProfile({ [MODE]: from.mode, [HOOKS]: from.hooks, [NC]: from.nc });
    MX.init(); drain();
    invariant(state(), `from ${JSON.stringify(from)}`);
    // every order of the three writes, each checked as soon as it lands (hand-edits in about:config)
    for (const order of [[MODE, HOOKS, NC], [HOOKS, MODE, NC], [NC, MODE, HOOKS], [MODE, NC, HOOKS]]) {
      for (const k of order) {
        const v = k === MODE ? to.mode : k === HOOKS ? to.hooks : to.nc;
        if (typeof v === "boolean") prefs.setBoolPref(k, v); else prefs.setStringPref(k, v);
        invariant(state(), `${JSON.stringify(from)} -> ${JSON.stringify(to)} after ${k}`);
        drain();
        invariant(state(), `${JSON.stringify(from)} -> ${JSON.stringify(to)} after ${k} + idle`);
      }
    }
    MX.uninit();
  }
});

test("0054: hooks switched off under Pollution leaves Pollution and restores RFP/FPP exactly", () => {
  freshProfile({ [MODE]: "pollution", [HOOKS]: true, [FPP]: true });
  MX.init(); drain();
  assert.deepEqual([get(RFP), get(FPP)], [false, false]);
  prefs.setBoolPref(HOOKS, false);
  drain();
  assert.equal(get(MODE), "homogeneous");
  assert.equal(get(RFP), true); assert.equal(user.has(RFP), false, "RFP back to default");
  assert.equal(user.get(FPP), true, "FPP user value restored");
  assert.equal(user.has("darkstr.xor.savedPrefs"), false);
});

test("0054: refusal with a cfg default of Pollution writes Homogeneous (no loop), and a pre-0054 bare profile is restored", () => {
  freshProfile({}, { [MODE]: "pollution" });
  MX.init(); drain();
  assert.equal(user.get(MODE), "homogeneous"); assert.equal(get(RFP), true);
  MX.uninit();
  // profile left by an older build in "Pollution, hooks off": RFP/FPP off, saved copy present
  freshProfile({ [MODE]: "pollution", [RFP]: false, [FPP]: false,
    "darkstr.xor.savedPrefs": JSON.stringify({ v: 1, prefs: { [RFP]: { user: false, value: null }, [FPP]: { user: false, value: null } } }) });
  MX.init(); drain();
  assert.equal(get(MODE), "homogeneous");
  assert.equal(user.has(RFP), false); assert.equal(get(RFP), true);
  assert.equal(user.has(FPP), false);
});

test("0054: Native-Compatible stays the documented escape (Pollution + hooks + NC: RFP off, native identity)", () => {
  freshProfile({ [MODE]: "pollution", [HOOKS]: true, [NC]: true });
  MX.init(); drain();
  assert.deepEqual(state(), { mode: "pollution", hooks: true, nc: true, rfp: false, fpp: false });
  assert.equal(MX._refusals || 0, 0);
});

// ------------------------------------------------------------ Settings pane ---
// darkstr.mjs with a Preferences stand-in; Setting semantics copied from toolkit Setting.mjs:
//   set value(v) { newVal = config.set ? config.set(v, deps, this) : v; pref.value = newVal }
//   userChange(v) { this.value = v; config.onUserChange?.(v, deps, this) }
function loadPane() {
  const src = readFileSync(join(F, "darkstr.mjs"), "utf8").replace(/^import .*$/m, "");
  const settings = new Map(), prefTypes = new Map();
  class Setting {
    constructor(config) { this.config = config; }
    get deps() { return Object.fromEntries((this.config.deps || []).map((d) => [d, settings.get(d)])); }
    get value() { return get(this.config.pref); }
    set value(v) {
      const nv = this.config.set ? this.config.set(v, this.deps, this) : v;
      if (prefTypes.get(this.config.pref) === "bool") prefs.setBoolPref(this.config.pref, nv); else prefs.setStringPref(this.config.pref, nv);
    }
    get disabled() { return this.config.disabled ? this.config.disabled(this.deps, this) : false; }
    userChange(v) { this.value = v; this.config.onUserChange?.(v, this.deps, this); }
  }
  const Preferences = {
    addAll: (list) => list.forEach(({ id, type }) => prefTypes.set(id, type)),
    getSetting: (id) => settings.get(id),
    addSetting: (config) => settings.set(config.id, new Setting(config)),
  };
  new Function("Preferences", "Services", src)(Preferences, globalThis.Services);
  return settings;
}

test("0054 pane: choosing Pollution turns hooks on first; leaving clears them; hooks checkbox is display-only", () => {
  freshProfile();
  MX.init(); drain();
  const S = loadPane();
  const mode = S.get("darkstrMode"), hooks = S.get("darkstrNativePersonaHooks");
  assert.equal(hooks.disabled, true, "disabled in Homogeneous");
  mode.userChange("pollution"); drain();
  assert.deepEqual(state(), { mode: "pollution", hooks: true, nc: false, rfp: false, fpp: false });
  assert.equal(MX._refusals || 0, 0, "the pane never hits the refusal");
  assert.equal(hooks.disabled, true, "disabled in Pollution too");
  // even a programmatic uncheck in Pollution keeps hooks on
  hooks.userChange(false); drain();
  assert.equal(get(HOOKS), true); assert.equal(get(MODE), "pollution");
  mode.userChange("homogeneous"); drain();
  assert.deepEqual(state(), { mode: "homogeneous", hooks: false, nc: false, rfp: true, fpp: false });
  assert.equal(user.has(RFP), false);
  // Native-Compatible from the pane, both orders
  S.get("darkstrNativeCompatible").userChange(true); mode.userChange("pollution"); drain();
  assert.deepEqual(state(), { mode: "pollution", hooks: true, nc: true, rfp: false, fpp: false });
  MX.uninit();
});

test("0054: pin -- three files against their shipped bases; ftl copy changes only the hooks description", () => {
  const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
  const sums = Object.fromEntries(readFileSync(join(F, "SHA256SUMS"), "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  assert.deepEqual(Object.keys(sums).sort(), ["DarkstrModeXor.sys.mjs", "darkstr.mjs", "preferences.ftl"]);
  for (const [n, h] of Object.entries(sums)) assert.equal(sha(`patches/0054-files/${n}`), h, n);
  const base = Object.fromEntries(readFileSync(join(F, "BASE_SHA256SUMS"), "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  assert.equal(base["browser/components/DarkstrModeXor.sys.mjs"], sha("patches/0057c-files/DarkstrModeXor.sys.mjs"));
  assert.equal(base["browser/components/preferences/config/darkstr.mjs"], sha("patches/0044-files/darkstr.mjs"));
  assert.match(base["browser/locales/en-US/browser/preferences/preferences.ftl"], /^[0-9a-f]{64}$/);
  const sh = readFileSync(join(root, "scripts/apply-0054-pollution-requires-hooks-mini.sh"), "utf8");
  assert.match(sh, /_refusePollution\(\)/);
  const ftl = readFileSync(join(F, "preferences.ftl"), "utf8");
  assert.match(ftl, /darkstr-native-persona-hooks =\n {4}\.label = Native persona hooks\n {4}\.description = On whenever Pollution is on: Pollution always applies the persona\. Use Native-Compatible for native identity\. Not anti-detect\./);
  assert.doesNotMatch(ftl, /Off by default\. Applies the persona/);
});
