/**
 * 0052: no debug state in prefs.js (Fable QA B1 / O7 / O13).
 *
 *   Every darkstr *.last*, *armed, effectiveSeed and persona mirror pref is
 *   diagnostics only. The shipped chrome modules (patches/0052-files) write
 *   them through a per-module in-memory facade; they reach prefs.js only while
 *   darkstr.debug.diagPrefs is true (default false). DarkstrModeXor clears any
 *   stale value at startup and when diagPrefs is switched off.
 *   DarkstrDepthHooks no longer falls back to the last visited site's seed /
 *   eTLD+1 / global phase mirror. The stale 0051 NativePersona copy is gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F52 = join(root, "patches/0052-files");
const MODULES = [
  "DarkstrChaffScheduler.sys.mjs",
  "DarkstrCookieFirewall.sys.mjs",
  "DarkstrDepthHooks.sys.mjs",
  "DarkstrFfi.sys.mjs",
  "DarkstrModeXor.sys.mjs",
  "DarkstrNativePersona.sys.mjs",
  "DarkstrWorkerHooks.sys.mjs",
];
// 0053+: the invariants hold for the newest shipped copy of each module.
const NEWER = ["0058c-files", "0054-files", "0059-files", "0058b-files", "0058fp-files", "0058-files", "0057c-files", "0057-files", "0056-files", "0055-files", "0053r2-files", "0053-files", "0052-files"].map((d) => join(root, "patches", d));
const shippedPath = (f) => NEWER.map((d) => join(d, f)).find((p) => existsSync(p));
// 0053: ModeXor's one-time legacy-profile check reads the old 0029 status
// string (migration only, never product behaviour); read-back checks skip it.
const stripMigration = (js) => {
  const a = js.indexOf("  _detectLegacyProfile() {");
  return a === -1 ? js : js.slice(0, a) + js.slice(js.indexOf("\n  },", a));
};
const src = (f) => stripMigration(readFileSync(shippedPath(f), "utf8"));

// ------------------------------------------------------------- stubs ---
const prefs = new Map();
const observers = [];
const prefApi = {
  getBoolPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
  getIntPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
  getStringPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
  getCharPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
  setBoolPref: (k, v) => setPref(k, v),
  setIntPref: (k, v) => setPref(k, v),
  setStringPref: (k, v) => setPref(k, v),
  setCharPref: (k, v) => setPref(k, v),
  prefHasUserValue: (k) => prefs.has(k),
  clearUserPref: (k) => {
    prefs.delete(k);
    notify(k);
  },
  getPrefType: (k) => (prefs.has(k) ? 32 : 0),
  addObserver: (k, o) => observers.push([k, o]),
  removeObserver: (k, o) => {
    const i = observers.findIndex(([a, b]) => a === k && b === o);
    if (i !== -1) observers.splice(i, 1);
  },
  PREF_INVALID: 0,
};
prefApi.getDefaultBranch = () => prefApi;
prefApi.getBranch = () => prefApi;
function notify(k) {
  for (const [name, o] of observers.slice()) {
    if (name === k || k.startsWith(name)) {
      (typeof o === "function" ? o : o.observe.bind(o))(null, "nsPref:changed", k);
    }
  }
}
function setPref(k, v) {
  prefs.set(k, v);
  notify(k);
}
globalThis.Services = {
  // 0055: personas derive their Firefox version from the engine.
  appinfo: { version: "156.0.1", name: "LibreWolf" },
  prefs: prefApi,
  tm: { dispatchToMainThread() {}, idleDispatchToMainThread() {} },
  obs: { addObserver() {}, removeObserver() {}, notifyObservers() {} },
};
globalThis.ChromeUtils = {
  importESModule() {
    throw new Error("not in node");
  },
  defineESModuleGetters() {},
};
globalThis.Ci = {};
globalThis.Cc = {};
globalThis.Cu = {};

const mx = await import(pathToFileURL(shippedPath("DarkstrModeXor.sys.mjs")));
const { DARKSTR_DIAG_PREFS, sweepDiagPrefs, DarkstrModeXor: MX } = mx;

/** const NAME_PREF = "darkstr.x.y" → { NAME_PREF: "darkstr.x.y" } */
function prefConsts(js) {
  const out = {};
  for (const m of js.matchAll(/^const ([A-Z0-9_]+) = "(darkstr\.[^"]+)";/gm)) {
    out[m[1]] = m[2];
  }
  return out;
}

const FUNCTIONAL = [
  "darkstr.mode",
  "darkstr.nativeCompatible",
  "darkstr.nativePersonaHooks",
  "darkstr.pollutionActive",
  "darkstr.strictFirstDoc",
  "darkstr.persona.seed",
  "darkstr.persona.snapshot",
  "darkstr.persona.rotatePerSite",
  "darkstr.cookieFirewall.enabled",
  "darkstr.cookieFirewall.mode",
  "darkstr.cookieFirewall.allowlist",
  "darkstr.cookieFirewall.contentGate",
  "darkstr.debug.diagPrefs",
];

// ------------------------------------------------------------ static ---
test("every module routes its diagnostic writes through the in-memory facade", () => {
  const facade = (js) =>
    js.slice(js.indexOf('const DIAG_PREFS_PREF = "darkstr.debug.diagPrefs";'), js.indexOf("\n};\n", js.indexOf("const diagPrefs = {")) + 4);
  const first = facade(src(MODULES[0]));
  assert.match(first, /if \(on === true\) \{\s*Services\.prefs\[setter\]\(name, value\);/);
  assert.match(first, /getBoolPref\(DIAG_PREFS_PREF, false\)/, "default off");
  for (const f of MODULES) {
    const js = src(f);
    assert.equal(facade(js), first, `${f}: identical facade`);
    assert.match(js, /getDiagnostics\(\) \{\s*return diagPrefs\.snapshot\(\);/, `${f}: getDiagnostics`);
    const consts = prefConsts(js);
    for (const [c, name] of Object.entries(consts)) {
      if (!DARKSTR_DIAG_PREFS.includes(name)) continue;
      assert.doesNotMatch(js, new RegExp(`Services\\.prefs\\.set\\w+Pref\\(\\s*${c}\\b`), `${f}: direct write of ${name}`);
      assert.doesNotMatch(js, new RegExp(`Services\\.prefs\\.get\\w+Pref\\(\\s*${c}\\b`), `${f}: ${name} read back`);
    }
    for (const name of DARKSTR_DIAG_PREFS) {
      const lit = name.replace(/\./g, "\\.");
      assert.doesNotMatch(js, new RegExp(`Services\\.prefs\\.set\\w+Pref\\(\\s*"${lit}"`), `${f}: literal write of ${name}`);
    }
    // Coverage: everything the facade writes is swept.
    for (const m of js.matchAll(/diagPrefs\.set\w+Pref\(\s*([A-Z0-9_]+)/g)) {
      assert.ok(consts[m[1]], `${f}: ${m[1]} resolves`);
      assert.ok(DARKSTR_DIAG_PREFS.includes(consts[m[1]]), `${f}: ${consts[m[1]]} in DARKSTR_DIAG_PREFS`);
    }
  }
});

test("DARKSTR_DIAG_PREFS is diagnostics only (functional state never swept)", () => {
  assert.equal(new Set(DARKSTR_DIAG_PREFS).size, DARKSTR_DIAG_PREFS.length);
  for (const k of FUNCTIONAL) {
    assert.ok(!DARKSTR_DIAG_PREFS.includes(k), k);
  }
  for (const k of DARKSTR_DIAG_PREFS) {
    assert.ok(!/\.saved/.test(k), `${k} is restore state`);
  }
  // Every entry is a pref some shipped module defines.
  const all = MODULES.map((f) => Object.values(prefConsts(src(f)))).flat();
  for (const k of DARKSTR_DIAG_PREFS) {
    assert.ok(all.includes(k), `${k} defined by a shipped module`);
  }
  // The keys Fable / Alex named explicitly.
  for (const k of [
    "darkstr.cookieFirewall.lastCookieOut",
    "darkstr.cookieFirewall.lastEtld",
    "darkstr.cookieFirewall.lastPartition",
    "darkstr.cookieFirewall.lastDecision",
    "darkstr.persona.effectiveSeed",
    "darkstr.persona.lastEtld",
    "darkstr.persona.lastDecision",
  ]) {
    assert.ok(DARKSTR_DIAG_PREFS.includes(k), k);
  }
});

test("no shipped chrome module reads a diagnostic pref back", () => {
  const dirs = ["0058c-files", "0054-files", "0059-files", "0058b-files", "0058fp-files", "0058-files", "0057c-files", "0057-files", "0056-files", "0055-files", "0053r2-files", "0053-files", "0052-files", "0051-files", "0049-files"].map((d) => join(root, "patches", d));
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith(".sys.mjs"))) {
      if (shippedPath(f) && shippedPath(f) !== join(d, f)) continue; // superseded
      const js = stripMigration(readFileSync(join(d, f), "utf8"));
      const consts = prefConsts(js);
      for (const name of DARKSTR_DIAG_PREFS) {
        const lit = name.replace(/\./g, "\\.");
        assert.doesNotMatch(js, new RegExp(`get\\w+Pref\\(\\s*"${lit}"`), `${f}: reads ${name}`);
        for (const [c, v] of Object.entries(consts)) {
          if (v === name) {
            assert.doesNotMatch(js, new RegExp(`get\\w+Pref\\(\\s*${c}\\b`), `${f}: reads ${name} via ${c}`);
          }
        }
      }
    }
  }
});

test("DepthHooks: no fallback to the last visited site's seed / eTLD+1 / global phase", () => {
  const dh = src("DarkstrDepthHooks.sys.mjs");
  for (const k of ['"darkstr.persona.lastEtld"', '"darkstr.persona.effectiveSeed"', '"darkstr.persona.docShellPhase"']) {
    assert.ok(!dh.includes(k), k);
  }
  const fn = dh.slice(dh.indexOf("if (rotating) {"), dh.indexOf("// Non-rotate / golden"));
  assert.match(fn, /if \(!seed\) \{\s*return null;\s*\}/, "unresolved site → no depth seeds");
  assert.match(dh, /\} catch \(_e\) \{\s*\/\/ 0052:[^\n]*\n(\s*\/\/[^\n]*\n)*\s*return null;\s*\}/, "NativePersona unavailable → fail closed");
});

test("stale 0051 NativePersona copy removed (O13)", () => {
  assert.equal(existsSync(join(root, "patches/0051-files/DarkstrNativePersona.sys.mjs")), false);
  assert.doesNotMatch(readFileSync(join(root, "patches/0051-files/SHA256SUMS"), "utf8"), /\sDarkstrNativePersona\.sys\.mjs$/m);
  const sh = readFileSync(join(root, "scripts/apply-0051-persona-surface-mini.sh"), "utf8");
  assert.doesNotMatch(sh, /"DarkstrNativePersona\.sys\.mjs:/);
  assert.ok(existsSync(join(F52, "DarkstrNativePersona.sys.mjs")));
});

// -------------------------------------------------------- behaviour ---
function stale() {
  prefs.clear();
  for (const k of DARKSTR_DIAG_PREFS) prefs.set(k, "stale");
  for (const k of FUNCTIONAL) prefs.set(k, k === "darkstr.mode" ? "homogeneous" : "keep");
  prefs.set("darkstr.persona.savedUserAgentOverride", "keep");
  prefs.delete("darkstr.debug.diagPrefs");
}

test("sweepDiagPrefs clears every stale diagnostic and nothing else", () => {
  stale();
  const cleared = sweepDiagPrefs();
  assert.deepEqual([...cleared].sort(), [...DARKSTR_DIAG_PREFS].sort());
  for (const k of DARKSTR_DIAG_PREFS) assert.equal(prefs.has(k), false, k);
  for (const k of FUNCTIONAL.filter((k) => k !== "darkstr.debug.diagPrefs")) assert.ok(prefs.has(k), k);
  assert.equal(prefs.get("darkstr.persona.savedUserAgentOverride"), "keep");
  assert.deepEqual(sweepDiagPrefs(), [], "idempotent");
});

test("sweepDiagPrefs leaves values alone while darkstr.debug.diagPrefs is on", () => {
  stale();
  prefs.set("darkstr.debug.diagPrefs", true);
  assert.deepEqual(sweepDiagPrefs(), []);
  for (const k of DARKSTR_DIAG_PREFS) assert.equal(prefs.get(k), "stale", k);
});

test("ModeXor.init sweeps once at startup; switching diagPrefs off sweeps again", () => {
  stale();
  MX.init();
  try {
    for (const k of DARKSTR_DIAG_PREFS) {
      assert.equal(prefs.has(k), false, `${k} cleared at startup`);
    }
    // init itself (WebGL ensure) records diagnostics in memory only.
    assert.equal(prefs.has("darkstr.webgl.lastStatus"), false);
    // QA session: diag on → mirrors written; diag off → swept immediately.
    setPref("darkstr.debug.diagPrefs", true);
    prefs.set("darkstr.cookieFirewall.lastCookieOut", "qa=1");
    setPref("darkstr.debug.diagPrefs", false);
    assert.equal(prefs.has("darkstr.cookieFirewall.lastCookieOut"), false);
  } finally {
    MX.uninit();
  }
  assert.equal(observers.filter(([k]) => k === "darkstr.debug.diagPrefs").length, 0, "observer removed");
});

test("diagPrefs default is off in every module (no defaultPref flips it on)", () => {
  for (const f of MODULES) {
    assert.doesNotMatch(src(f), /setBoolPref\(\s*DIAG_PREFS_PREF/, f);
  }
});
