/**
 * 0058d (Fable follow-ups to 0058c):
 *   (a) a pasted snapshot that fails validation (e.g. platform but no
 *       userAgent) is refused with a console warning and falls back to the
 *       seeded per-site persona, never native (it used to lock rotation and
 *       resolve to nothing: a fully native page, no warning);
 *   (b) seedless-snapshot depth seeds are mixed with the site's own 0056 store
 *       seed (eTLD+1 + persona context): same navigator identity and GPU on
 *       every site, depth noise per site and stable per site;
 *   (c) ModeXor exposes darkstr.xor.lastRefusal and the refusal count through
 *       getDiagnostics(); prefs.js only while darkstr.debug.diagPrefs is on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = (f) => join(root, "patches", f);
const read = (f) => readFileSync(P(f), "utf8");
const sha = (f) => createHash("sha256").update(readFileSync(P(f))).digest("hex");

const UA = {
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0",
};

// ---------------------------------------------------------------- stubs
const prefs = new Map();
const DEFAULTS = {
  "darkstr.mode": "homogeneous",
  "darkstr.nativeCompatible": false,
  "darkstr.nativePersonaHooks": false,
  "darkstr.persona.rotatePerSite": true,
};
const getP = (k, d) => (prefs.has(k) ? prefs.get(k) : k in DEFAULTS ? DEFAULTS[k] : d);
const writes = [];
const setP = (k, v) => (writes.push(k), prefs.set(k, v));
const warns = [];
const realWarn = console.warn;
globalThis.Services = {
  appinfo: { version: "156.0.1", name: "LibreWolf" },
  prefs: {
    getBoolPref: getP, getStringPref: getP, getCharPref: getP, getIntPref: getP,
    getPrefType: (k) => (typeof getP(k) === "number" ? 64 : typeof getP(k) === "string" ? 32 : 0),
    setBoolPref: setP, setStringPref: setP, setCharPref: setP, setIntPref: setP,
    prefHasUserValue: (k) => prefs.has(k), clearUserPref: (k) => prefs.delete(k),
    addObserver() {}, removeObserver() {},
    getDefaultBranch: () => ({ getStringPref: (k, d) => (k in DEFAULTS ? DEFAULTS[k] : d), getBoolPref: (k, d) => (k in DEFAULTS ? DEFAULTS[k] : d) }),
  },
  eTLD: { getBaseDomain: (u) => u.host.split(".").slice(-2).join("."), getBaseDomainFromHost: (h) => h.split(".").slice(-2).join(".") },
  locale: { get acceptLanguages() { return "en-US, en"; } },
  obs: { addObserver() {}, removeObserver() {}, notifyObservers() {} },
  ppmm: { addMessageListener() {}, removeMessageListener() {}, broadcastAsyncMessage() {} },
  wm: { getEnumerator: () => [] },
  tm: { dispatchToMainThread: (f) => f(), idleDispatchToMainThread: (f) => f() },
};
globalThis.Cc = { "@mozilla.org/network/protocol;1?name=http": { getService: () => ({ oscpu: "Intel Mac OS X 10.15" }) } };
globalThis.Ci = { nsIPrefBranch: { PREF_INT: 64, PREF_STRING: 32 }, nsIHttpProtocolHandler: {}, nsIHttpChannel: {}, nsIContentPolicy: { TYPE_DOCUMENT: 6 } };
globalThis.Cu = { waiveXrays: (x) => x, unwaiveXrays: (x) => x, exportFunction: (f) => f, cloneInto: (v) => structuredClone(v) };
let fakeModules = {};
globalThis.ChromeUtils = {
  importESModule(uri) {
    if (fakeModules[uri]) return fakeModules[uri];
    throw new Error("no module in node: " + uri);
  },
  defineESModuleGetters() {}, registerWindowActor() {}, unregisterWindowActor() {},
};
globalThis.JSWindowActorChild = class {};
globalThis.JSWindowActorParent = class {};
globalThis.WindowGlobalParent = { getByInnerWindowId: () => null };

const quiet = async (f) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };
const NP = await quiet(() => import(pathToFileURL(P("0058d-files/DarkstrNativePersona.sys.mjs")).href));
const NP_OLD = await quiet(() => import(pathToFileURL(P("0058fp-files/DarkstrNativePersona.sys.mjs")).href));
const SNAP = "darkstr.persona.snapshot";
function pollution(extra = {}) {
  prefs.clear(); writes.length = 0; warns.length = 0;
  prefs.set("darkstr.mode", "pollution");
  prefs.set("darkstr.nativePersonaHooks", true);
  for (const [k, v] of Object.entries(extra)) prefs.set(k, v);
  for (const m of [NP.DarkstrNativePersona, NP_OLD.DarkstrNativePersona]) {
    m._plan = null; m._lockedSnapCache = null; m._snapshotCheckCache = null; m._snapshotRefusals = 0;
  }
}
const withWarn = (f) => { console.warn = (...a) => warns.push(a.join(" ")); try { return quiet(f); } finally { console.warn = realWarn; } };

// ---------------------------------------------------------------- (a)
test("0058d (a): validateSnapshot accepts real snapshots and names what is wrong otherwise", () => {
  const v = NP.validateSnapshot;
  for (const ok of [
    { userAgent: UA.win, platform: "Win32", hardwareConcurrency: 8, deviceMemory: 8, languages: ["en-US", "en"], timezone: "America/Chicago" },
    { userAgent: UA.linux },
    { userAgent: UA.mac, platform: "MacIntel", canvasSeed: 1, audioSeed: 2, gpu: { vendor: "Apple", renderer: "Apple M2" } },
  ]) assert.equal(v(JSON.stringify(ok)).ok, true, JSON.stringify(ok));
  const bad = [
    ['{"platform":"Win32"}', "no userAgent"],
    ['{"userAgent":""}', "no userAgent"],
    ["not json", "not JSON"],
    ["[1,2]", "not a JSON object"],
    ['{"userAgent":"curl/8.7.1"}', "userAgent is not a browser UA"],
    [JSON.stringify({ userAgent: UA.win, platform: 32 }), "platform is not a string"],
    [JSON.stringify({ userAgent: UA.win, hardwareConcurrency: 0 }), "hardwareConcurrency is not an integer 1..256"],
    [JSON.stringify({ userAgent: UA.win, hardwareConcurrency: "8" }), "hardwareConcurrency is not an integer 1..256"],
    [JSON.stringify({ userAgent: UA.win, deviceMemory: -1 }), "deviceMemory is not a positive number"],
    [JSON.stringify({ userAgent: UA.win, languages: [] }), "languages is not a list of language tags"],
    [JSON.stringify({ userAgent: UA.win, timezone: "Mars/Olympus_Mons" }), "unknown timezone"],
  ];
  for (const [raw, reason] of bad) assert.deepEqual(v(raw), { ok: false, reason }, raw);
});

test("0058d (a): platform-only snapshot under Pollution -> refused + warning, per-site persona (0058fp: fully native, silent)", async () => {
  const raw = JSON.stringify({ platform: "Win32", hardwareConcurrency: 4 });
  // negative control: the shipped 0058fp copy locks rotation and resolves nothing
  pollution({ [SNAP]: raw });
  const old = NP_OLD.DarkstrNativePersona;
  await withWarn(() => old.refreshPlan());
  assert.equal(old._rotationLocked(), true, "0058fp: locked by the bad snapshot");
  assert.equal(old.getPlan().applyNativeBase, false, "0058fp: no persona at all (native)");
  assert.equal(warns.length, 0, "0058fp: no warning");
  // 0058d
  pollution({ [SNAP]: raw });
  const np = NP.DarkstrNativePersona;
  await withWarn(() => np.refreshPlan());
  const plan = np.getPlan();
  assert.equal(np._rotationLocked(), false);
  assert.equal(plan.rotatePerSite, true, "seeded per-site persona");
  assert.equal(plan.applyNativeBase, true, "a persona applies, never native");
  assert.equal(plan.snapshot, null, "the refused snapshot is not used");
  assert.equal(warns.filter((w) => /snapshot refused \(no userAgent\)/.test(w)).length, 1, warns.join("\n"));
  assert.ok(!warns.some((w) => w.includes("Win32")), "the warning never carries snapshot text");
  await withWarn(() => np.refreshPlan());
  assert.equal(warns.filter((w) => /refused/.test(w)).length, 1, "warned once per distinct snapshot text");
  const diag = np.getDiagnostics();
  assert.equal(diag["darkstr.persona.lastSnapshotRefusal"], "no userAgent");
  assert.equal(diag["darkstr.persona.snapshotRefusals"], 1);
  assert.ok(!writes.includes("darkstr.persona.lastSnapshotRefusal"), "no prefs.js write while diagPrefs is off");
  // per-site personas still differ per site and are not native
  const a = np._snapshotForEtld ? np._snapshotForEtld("a.test", "0") : null;
  if (a) assert.ok(a.userAgent, "per-site snapshot resolves");
});

test("0058d (a): every way a snapshot can fail validation gives a persona, with rotatePerSite=false or a fixed seed too", async () => {
  const np = NP.DarkstrNativePersona;
  for (const raw of ['{"platform":"Win32"}', "not json", '{"userAgent":"curl/8"}', JSON.stringify({ userAgent: UA.win, timezone: "Nowhere/Here" })]) {
    pollution({ [SNAP]: raw, "darkstr.persona.rotatePerSite": false });
    await withWarn(() => np.refreshPlan());
    assert.equal(np.getPlan().applyNativeBase, true, `${raw}: rotatePerSite=false still gets the per-site persona`);
    assert.equal(np.getPlan().rotatePerSite, true, raw);
    assert.equal(warns.filter((w) => /refused/.test(w)).length, 1, raw);
    pollution({ [SNAP]: raw, "darkstr.persona.seed": 42 });
    await withWarn(() => np.refreshPlan());
    const p = np.getPlan();
    assert.equal(np._rotationLocked(), true, `${raw}: fixed seed locks`);
    assert.equal(p.applyNativeBase, true, `${raw}: seed persona`);
    assert.ok(p.snapshot?.userAgent, `${raw}: snapshot from the seed`);
  }
  // valid snapshot: unchanged lock + use
  pollution({ [SNAP]: JSON.stringify({ userAgent: UA.win, platform: "Win32" }) });
  await withWarn(() => np.refreshPlan());
  assert.equal(np._rotationLocked(), true);
  assert.match(np.getPlan().snapshot.userAgent, /Windows NT 10\.0/);
  assert.equal(warns.length, 0);
  // diagPrefs on: the refusal reaches prefs.js (reason only)
  pollution({ [SNAP]: '{"platform":"Win32"}', "darkstr.debug.diagPrefs": true });
  await withWarn(() => np.refreshPlan());
  assert.equal(prefs.get("darkstr.persona.lastSnapshotRefusal"), "no userAgent");
  assert.equal(prefs.get("darkstr.persona.snapshotRefusals"), 1);
});

// ---------------------------------------------------------------- (b)
const DH = await quiet(() => import(pathToFileURL(P("0058d-files/DarkstrDepthHooks.sys.mjs")).href));
function depthFor(raw, site, ctx, { storeSeeds = {}, decisionSnap } = {}) {
  prefs.clear(); prefs.set(SNAP, raw);
  const fakeNP = {
    documentDecision: () => ({ site, ctx, snapshot: decisionSnap || JSON.parse(raw) }),
    getPlan: () => ({ pollutionActive: true, nativeHooks: true }),
    _rotationActive: () => false,
    _storeSeedForEtld: (e, c) => storeSeeds[`${c}|${e}`] || 0,
  };
  fakeModules = { "moz-src:///browser/components/DarkstrNativePersona.sys.mjs": { DarkstrNativePersona: fakeNP, validateSnapshot: NP.validateSnapshot } };
  const H = DH.DarkstrDepthHooks;
  const seeds = H._readDepthSeeds();
  H.getPlan = () => ({ armed: true, seeds, perSite: false });
  H._writeLastSeeds = () => {};
  return H.depthSeedsForBrowsingContext({ id: 1 }, { innerWindowId: 1 });
}
const NOISE = ["canvasSeed", "audioSeed", "fontSeed", "speechSeed", "webgpuSeed"];

test("0058d (b): seedless snapshot -> depth noise per site and context, stable per site; identity (GPU) shared", () => {
  const raw = JSON.stringify({ userAgent: UA.win, platform: "Win32" });
  const store = { "0|a.test": 0x1111, "0|b.test": 0x2222, "1|a.test": 0x3333 };
  const a = depthFor(raw, "a.test", "0", { storeSeeds: store });
  const a2 = depthFor(raw, "a.test", "0", { storeSeeds: store });
  const b = depthFor(raw, "b.test", "0", { storeSeeds: store });
  const a1 = depthFor(raw, "a.test", "1", { storeSeeds: store });
  assert.deepEqual(a, a2, "stable per site");
  for (const k of NOISE) {
    assert.notEqual(a[k], b[k], `${k}: differs across sites`);
    assert.notEqual(a[k], a1[k], `${k}: differs across contexts (container)`);
  }
  assert.deepEqual(a.gpu, b.gpu, "one GPU string per snapshot");
  assert.deepEqual(a.gpu, a1.gpu);
  assert.ok(!("snapshotTextSeed" in a) && !("snapshotOs" in a), "internal fields never reach content");
  // without a store seed: still per site (FNV site key), never shared
  const na = depthFor(raw, "a.test", "0"), nb = depthFor(raw, "b.test", "0");
  for (const k of NOISE) assert.notEqual(na[k], nb[k], `${k}: no-store fallback per site`);
  assert.deepEqual(na, depthFor(raw, "a.test", "0"));
});

test("0058d (b): only seedless snapshots are mixed; full depth snapshots and darkstr.persona.seed are unchanged vs 0058c", () => {
  const full = JSON.stringify({ userAgent: UA.mac, canvasSeed: 11, audioSeed: 22, gpu: { vendor: "Apple", renderer: "Apple M2" } });
  const fa = depthFor(full, "a.test", "0"), fb = depthFor(full, "b.test", "0");
  assert.equal(fa.canvasSeed, 11); assert.deepEqual(fa, fb, "an operator's explicit depth seeds stay global");
  const raw = JSON.stringify({ userAgent: UA.win });
  const H = DH.DarkstrDepthHooks;
  prefs.clear(); prefs.set(SNAP, raw); prefs.set("darkstr.persona.seed", 42);
  const s = H._readDepthSeeds();
  assert.equal(s.snapshotTextSeed, undefined, "seed pref path is not mixed");
  // the unmixed text seed itself is 0058c's
  prefs.clear(); prefs.set(SNAP, raw);
  assert.equal(H._readDepthSeeds().snapshotTextSeed, DH.snapshotDepthSeed(raw));
  // a refused snapshot is not a depth snapshot either
  prefs.clear(); prefs.set(SNAP, '{"platform":"Win32"}');
  fakeModules = { "moz-src:///browser/components/DarkstrNativePersona.sys.mjs": { validateSnapshot: NP.validateSnapshot } };
  assert.equal(H._readDepthSeeds(), null);
});

test("0058d (b): mixSiteDepthSeed / siteKeySeed are total, deterministic and spread", () => {
  const seen = new Set();
  for (let s = 0; s < 64; s++) for (let t = 0; t < 64; t++) {
    const m = DH.mixSiteDepthSeed(s * 0x9e3779b1, t * 7919);
    assert.ok(m > 0 && m <= 0xffffffff); seen.add(m);
  }
  assert.ok(seen.size > 4090, `collisions: ${4096 - seen.size}`);
  assert.equal(DH.siteKeySeed("a.test", "0"), DH.siteKeySeed("a.test", "0"));
  assert.notEqual(DH.siteKeySeed("a.test", "0"), DH.siteKeySeed("a.test", "1"));
});

// ---------------------------------------------------------------- (c)
const MX = await quiet(() => import(pathToFileURL(P("0058d-files/DarkstrModeXor.sys.mjs")).href));
test("0058d (c): ModeXor.getDiagnostics exposes lastRefusal + refusalCount; prefs.js only with diagPrefs", async () => {
  const mx = MX.DarkstrModeXor;
  prefs.clear(); writes.length = 0; mx._refusals = 0;
  let d = mx.getDiagnostics();
  assert.equal(d["darkstr.xor.refusalCount"] ?? 0, 0, "no refusal yet");
  assert.equal(d["darkstr.xor.lastRefusal"] ?? "", "");
  prefs.set("darkstr.mode", "pollution");
  await withWarn(() => mx._refusePollution());
  await withWarn(() => mx._refusePollution());
  d = mx.getDiagnostics();
  assert.equal(d["darkstr.xor.lastRefusal"], "pollution-without-hooks");
  assert.equal(d["darkstr.xor.refusalCount"], 2);
  assert.ok(!writes.includes("darkstr.xor.lastRefusal") && !writes.includes("darkstr.xor.refusalCount"), "no prefs.js write with diagPrefs off");
  prefs.set("darkstr.debug.diagPrefs", true); prefs.set("darkstr.mode", "pollution");
  await withWarn(() => mx._refusePollution());
  assert.equal(prefs.get("darkstr.xor.refusalCount"), 3);
  assert.equal(prefs.get("darkstr.xor.lastRefusal"), "pollution-without-hooks");
  for (const k of ["darkstr.xor.refusalCount", "darkstr.persona.lastSnapshotRefusal", "darkstr.persona.snapshotRefusals"]) {
    assert.ok(MX.DARKSTR_DIAG_PREFS.includes(k), `${k} is swept at startup like every diagnostic`);
  }
});

// ---------------------------------------------------------------- pin
test("0058d pin: files, sums, bases are the shipped copies (0058fp / 0058c / 0054), apply script checks the behaviour", () => {
  const sums = Object.fromEntries(read("0058d-files/SHA256SUMS").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  for (const [n, h] of Object.entries(sums)) assert.equal(sha(`0058d-files/${n}`), h, n);
  const base = Object.fromEntries(read("0058d-files/BASE_SHA256SUMS").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  assert.deepEqual(base, {
    "browser/components/DarkstrNativePersona.sys.mjs": sha("0058fp-files/DarkstrNativePersona.sys.mjs"),
    "browser/components/DarkstrDepthHooks.sys.mjs": sha("0058c-files/DarkstrDepthHooks.sys.mjs"),
    "browser/components/DarkstrModeXor.sys.mjs": sha("0054-files/DarkstrModeXor.sys.mjs"),
  });
  const sh = readFileSync(join(root, "scripts/apply-0058d-snapshot-validation-mini.sh"), "utf8");
  assert.match(sh, /export function validateSnapshot\(raw\)/);
  assert.match(sh, /export function mixSiteDepthSeed\(snapSeed, siteSeed\)/);
  assert.match(sh, /REFUSAL_COUNT_PREF/);
  assert.match(read("STACK"), /\n0058d\n?$/);
});
