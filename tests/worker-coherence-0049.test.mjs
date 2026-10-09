/**
 * 0049: worker coherence (Rowan B3/B4/B5 + builder misses) — behavioural
 * tests against the shipped modules in patches/0049-files, with the 0051
 * page child (patches/0051-files) and minimal XPCOM / DOM stubs.
 * 0052: DarkstrNativePersona / DarkstrWorkerHooks ship from patches/0052-files
 * (diagnostics in memory only); the rest still ships from 0049 / 0051.
 *
 *   B3  Dedicated workers report their creating document's persona (UA,
 *       platform, hardwareConcurrency, languages, timezone); Shared/Service
 *       workers report the owning site's persona. No seed pref needed.
 *       One persona generator (DarkstrNativePersona); no Firefox 135 list.
 *   B4/B5/location/importScripts/constructor shape: no Worker wrapping and
 *       no blob: scripts at all (native C++ WorkerNavigator + prelude).
 *   deviceMemory is never added to workers.
 *   Windowless worker requests carry the owning site's persona headers.
 *   Defaults (hooks off) never reach chrome: plain Firefox 156 workers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = join(root, "patches/0049-files");
const FILES51 = join(root, "patches/0051-files");
const FILES52 = join(root, "patches/0052-files");
// Newest shipped copy of a module (0052 supersedes 0049 where it has one).
const shipped = (f) => (existsSync(join(FILES52, f)) ? join(FILES52, f) : join(FILES, f));
const src = (f) => readFileSync(shipped(f), "utf8");

const NATIVE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0";
const NATIVE_AL = "en-US,en;q=0.9";
const PID = 4242;
const TOPIC = "darkstr-worker-persona-resolve";

// ---------------------------------------------------------------- stubs ---
const prefs = new Map();
const DEFAULTS = {
  "darkstr.mode": "homogeneous",
  "darkstr.nativeCompatible": false,
  "darkstr.nativePersonaHooks": false,
  "darkstr.strictFirstDoc": true,
  "darkstr.persona.rotatePerSite": true,
};
const getP = (k, d) => (prefs.has(k) ? prefs.get(k) : k in DEFAULTS ? DEFAULTS[k] : d);
const setP = (k, v) => prefs.set(k, v);
const ppmmListeners = {};
const browsers = [];
let syncCalls = 0;
function uri(url) {
  const u = new URL(url);
  return { spec: url, scheme: u.protocol.slice(0, -1), host: u.hostname, asciiHost: u.hostname };
}
globalThis.Services = {
  prefs: {
    getBoolPref: getP,
    getStringPref: getP,
    getCharPref: getP,
    getIntPref: getP,
    getPrefType: () => 0,
    setBoolPref: setP,
    setStringPref: setP,
    setCharPref: setP,
    setIntPref: setP,
    prefHasUserValue: (k) => prefs.has(k),
    clearUserPref: (k) => prefs.delete(k),
    addObserver() {},
    removeObserver() {},
  },
  eTLD: {
    getBaseDomain: (u) => u.host.split(".").slice(-2).join("."),
    getBaseDomainFromHost: (h) => h.split(".").slice(-2).join("."),
  },
  io: { newURI: (s) => uri(s) },
  locale: { acceptLanguages: "en-US, en" },
  obs: { addObserver() {}, removeObserver() {} },
  ppmm: {
    addMessageListener: (n, l) => (ppmmListeners[n] = l),
    removeMessageListener: (n) => delete ppmmListeners[n],
  },
  cpmm: {
    sendSyncMessage: (name, data) => {
      syncCalls++;
      return [ppmmListeners[name]?.receiveMessage({ name, data, target: { osPid: PID } })];
    },
  },
  wm: { getEnumerator: () => [{ gBrowser: { browsers } }] },
};
globalThis.Cc = {
  "@mozilla.org/network/protocol;1?name=http": {
    getService: () => ({ oscpu: "Intel Mac OS X 10.15" }),
  },
};
globalThis.Ci = {
  nsIHttpChannel: {},
  nsIHttpProtocolHandler: {},
  nsIWritablePropertyBag2: {},
  nsIPrefBranch: { PREF_INT: 64, PREF_STRING: 32 },
  nsIContentPolicy: { TYPE_DOCUMENT: 6, TYPE_SUBDOCUMENT: 7, TYPE_SCRIPT: 2, TYPE_FETCH: 20 },
};
globalThis.Cu = {
  waiveXrays: (x) => x,
  unwaiveXrays: (x) => x,
  exportFunction: (f) => f,
  cloneInto: (v) => (Array.isArray(v) ? v.slice() : structuredClone(v)),
};
let depthFor = () => null;
const registered = { process: [], window: [] };
const modules = {};
globalThis.ChromeUtils = {
  importESModule(url) {
    if (url.endsWith("DarkstrNativePersona.sys.mjs")) return modules.persona;
    if (url.endsWith("DarkstrDepthHooks.sys.mjs")) {
      return { DarkstrDepthHooks: { depthSeedsForBrowsingContext: (bc) => depthFor(bc) } };
    }
    throw new Error("no FFI in node");
  },
  defineESModuleGetters() {},
  registerWindowActor: (n, o) => registered.window.push([n, o]),
  unregisterWindowActor() {},
  registerProcessActor: (n, o) => registered.process.push([n, o]),
  unregisterProcessActor() {},
};
globalThis.JSWindowActorChild = class {};
globalThis.JSWindowActorParent = class {};
globalThis.JSProcessActorChild = class {};
globalThis.JSProcessActorParent = class {};
const wgById = new Map();
globalThis.WindowGlobalParent = { getByInnerWindowId: (id) => wgById.get(id) || null };

modules.persona = await import(pathToFileURL(shipped("DarkstrNativePersona.sys.mjs")));
const pageChild = await import(pathToFileURL(join(FILES51, "DarkstrNativePersonaChild.sys.mjs")));
const workerMod = await import(pathToFileURL(shipped("DarkstrWorkerHooks.sys.mjs")));
const workerChild = await import(pathToFileURL(join(FILES, "DarkstrWorkerHooksChild.sys.mjs")));
const P = modules.persona.DarkstrNativePersona;
const W = workerMod.DarkstrWorkerHooks;
const { prepareAcceptLanguages } = modules.persona;

// ------------------------------------------------------- fake Gecko ---
function principal(url) {
  const u = new URL(url);
  return {
    isContentPrincipal: /^(https?|file):$/.test(u.protocol),
    URI: uri(url),
    originNoSuffix: u.origin,
    schemeIs: (s) => u.protocol === s + ":",
  };
}
let nextId = 100;
function makeWG(bc, url, top = null) {
  const wg = {
    innerWindowId: nextId++,
    browsingContext: bc,
    documentPrincipal: principal(url),
    documentURI: uri(url),
    osPid: PID,
    isInProcess: false,
  };
  wg.topWindowContext = top || wg;
  wgById.set(wg.innerWindowId, wg);
  return wg;
}
function newTab() {
  const bc = { id: nextId++, browserId: nextId++, parent: null, currentURI: null, currentWindowGlobal: null };
  bc.top = bc;
  const browser = { browsingContext: bc };
  browsers.push(browser);
  bc.close = () => browsers.splice(browsers.indexOf(browser), 1);
  return bc;
}
function channel(url, { bc, type = 20, wg = null, triggering = null, partitionKey = "", assoc = null } = {}) {
  const h = new Map(Object.entries({ "User-Agent": NATIVE_UA, "Accept-Language": NATIVE_AL }));
  return {
    URI: uri(url),
    originalURI: uri(url),
    loadInfo: {
      externalContentPolicyType: type,
      isTopLevelLoad: type === 6 && !bc?.parent,
      browsingContext: bc,
      innerWindowID: wg ? wg.innerWindowId : 0,
      // Gecko: set on every request a dedicated (or nested) worker makes.
      associatedBrowsingContextID: assoc ? assoc.id : 0,
      associatedBrowsingContext: assoc,
      triggeringPrincipal: triggering,
      loadingPrincipal: triggering,
      originAttributes: { partitionKey },
      redirectChainIncludingInternalRedirects: [],
    },
    setRequestHeader(k, v) {
      if (v === "") h.delete(k);
      else h.set(k, v);
    },
    getRequestHeader(k) {
      if (!h.has(k)) throw new Error("NS_ERROR_NOT_AVAILABLE");
      return h.get(k);
    },
    visitRequestHeaders(f) {
      for (const [k, v] of h) f(k, v);
    },
    QueryInterface() {
      return this;
    },
    ua: () => h.get("User-Agent"),
    al: () => h.get("Accept-Language"),
  };
}
function fire(ch) {
  P._onModifyRequest(ch, "http-on-modify-request");
  return ch;
}
function makeWindow() {
  const brand = new WeakSet();
  const langs = Object.freeze(["en-US", "en"]);
  const proto = {};
  const natives = {
    get userAgent() { return NATIVE_UA; },
    get platform() { return "MacIntel"; },
    get hardwareConcurrency() { return 12; },
    get language() { return "en-US"; },
    get languages() { return langs; },
  };
  for (const k of Object.keys(natives)) {
    const d = Object.getOwnPropertyDescriptor(natives, k);
    Object.defineProperty(proto, k, { get: d.get, enumerable: true, configurable: true });
  }
  function Navigator() {}
  Navigator.prototype = proto;
  const navigator = Object.create(proto);
  brand.add(navigator);
  return { Navigator, navigator, Object };
}
function navigate(bc, url) {
  const ch = fire(channel(url, { bc, type: 6 }));
  const wg = makeWG(bc, url);
  bc.currentURI = uri(url);
  bc.currentWindowGlobal = wg;
  const window = makeWindow();
  const actor = new pageChild.DarkstrNativePersonaChild();
  actor.manager = { innerWindowId: wg.innerWindowId };
  actor.document = { nodePrincipal: principal(url) };
  actor.contentWindow = window;
  actor.handleEvent({ type: "DOMWindowCreated" });
  const nav = window.navigator;
  return {
    ch,
    wg,
    nav,
    view: () => ({
      ua: nav.userAgent,
      platform: nav.platform,
      hc: nav.hardwareConcurrency,
      language: nav.language,
      languages: [...nav.languages],
      tz: bc.top.timezoneOverride || "",
    }),
  };
}

/** Property bag as C++ ResolveWorkerPersona builds it. */
function makeBag(init) {
  const m = new Map(Object.entries(init));
  const get = (k) => {
    if (!m.has(k)) throw new Error("NS_ERROR_NOT_AVAILABLE");
    return m.get(k);
  };
  const set = (k, v) => m.set(k, v);
  return {
    m,
    QueryInterface() { return this; },
    getPropertyAsAString: get,
    getPropertyAsACString: get,
    getPropertyAsUint64: get,
    getPropertyAsUint32: get,
    setPropertyAsAString: (k, v) => set(k, String(v)),
    setPropertyAsACString: (k, v) => set(k, String(v)),
    setPropertyAsUint32: (k, v) => set(k, v >>> 0),
    setPropertyAsUint64: (k, v) => set(k, v),
  };
}
/** Mirror of DarkstrNavigatorHooks::ResolveWorkerPersona + WorkerNavigator. */
function startWorker({ kind = "dedicated", wg = null, origin, partitionKey = "" }) {
  const gate =
    getP("darkstr.nativePersonaHooks", false) &&
    !getP("darkstr.nativeCompatible", false) &&
    getP("darkstr.mode", "") === "pollution";
  const native = {
    ua: NATIVE_UA, platform: "MacIntel", hc: 12, language: "en-US",
    languages: ["en-US", "en"], tz: wg?.browsingContext?.top?.timezoneOverride || "",
    deviceMemory: false, prelude: "",
  };
  if (!gate) return { ...native, observed: false };
  const bag = makeBag({
    kind,
    scriptURL: (origin || "") + "/w.js",
    innerWindowId: wg ? wg.innerWindowId : 0,
    principalOrigin: origin || new URL(wg.documentURI.spec).origin,
    partitionKey,
  });
  new workerChild.DarkstrWorkerPersonaChild().observe(bag, TOPIC, null);
  const ua = bag.m.get("userAgent") || "";
  if (!ua) return { ...native, observed: true, prelude: bag.m.get("prelude") || "" };
  const languages = bag.m.has("languages") ? bag.m.get("languages").split(",") : native.languages;
  return {
    ua,
    platform: bag.m.get("platform") || "MacIntel",
    hc: bag.m.get("hardwareConcurrency") || 12,
    language: languages[0],
    languages,
    tz: bag.m.get("timezone") || native.tz,
    deviceMemory: false,
    prelude: bag.m.get("prelude") || "",
    observed: true,
  };
}
const pick = (w) => ({ ua: w.ua, platform: w.platform, hc: w.hc, language: w.language, languages: w.languages, tz: w.tz });

function fresh(extra = {}) {
  if (W._inited) W.uninit();
  if (P._inited) P.uninit();
  prefs.clear();
  browsers.length = 0;
  for (const [k, v] of Object.entries(extra)) prefs.set(k, v);
  P._plan = null;
  W._plan = null;
  depthFor = () => null;
  P.init();
  W.init();
}
const ARMED = { "darkstr.mode": "pollution", "darkstr.nativePersonaHooks": true };
const LOCKED_SNAPSHOT = JSON.stringify({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
  platform: "MacIntel",
  hardwareConcurrency: 6,
  languages: ["en-US", "en", "es"],
  timezone: "Europe/London",
});
const SETUPS = {
  "no seed": { ...ARMED },
  "seed 42": { ...ARMED, "darkstr.persona.seed": 42 },
  locked: { ...ARMED, "darkstr.persona.snapshot": LOCKED_SNAPSHOT },
};

// ------------------------------------------------------------------ B3 ---
for (const [name, setup] of Object.entries(SETUPS)) {
  test(`B3 (${name}): dedicated + shared + service worker == page persona`, () => {
    fresh(setup);
    const t = newTab();
    const first = navigate(t, "https://www.alpha.test/");
    // First document of the tab: native page, native worker.
    const w0 = startWorker({ wg: first.wg });
    assert.equal(first.nav.userAgent, NATIVE_UA);
    assert.equal(w0.ua, NATIVE_UA, "first-document worker native like its page");
    const page = navigate(t, "https://www.alpha.test/2");
    const pv = page.view();
    assert.notEqual(pv.ua, NATIVE_UA, `${name}: page armed`);
    assert.match(pv.ua, /rv:140\.0\) Gecko\/20100101 Firefox\/140\.0$/);
    const ded = startWorker({ wg: page.wg });
    assert.deepEqual(pick(ded), pv, `${name}: dedicated worker == page`);
    const shared = startWorker({ kind: "shared", origin: "https://www.alpha.test", partitionKey: "(https,alpha.test)" });
    assert.deepEqual(pick(shared), pv, `${name}: SharedWorker == owning site page`);
    const service = startWorker({ kind: "service", origin: "https://www.alpha.test" });
    assert.deepEqual(pick(service), pv, `${name}: ServiceWorker == owning site page`);
    for (const w of [ded, shared, service]) {
      assert.equal(w.deviceMemory, false, "no deviceMemory in workers");
      assert.doesNotMatch(w.ua, /rv:135|Mac OS X 14\.0/);
    }
    if (name === "locked") {
      assert.equal(ded.tz, "Europe/London");
      assert.deepEqual(ded.languages, ["en-US", "en", "es"]);
      assert.equal(ded.hc, 6);
    }
  });
}

test("B3: no seed pref still arms workers (session persona, same as page)", () => {
  fresh(ARMED);
  assert.equal(W.getDiagnostics()["darkstr.worker.hooksArmed"], true);
  assert.equal(prefs.has("darkstr.worker.hooksArmed"), false, "0052: diag in memory only");
  const t = newTab();
  navigate(t, "https://beta.test/");
  const page = navigate(t, "https://beta.test/2");
  const w = startWorker({ wg: page.wg });
  assert.notEqual(w.ua, NATIVE_UA);
  assert.equal(w.ua, page.nav.userAgent);
  assert.equal(w.hc, page.nav.hardwareConcurrency);
});

test("B3: per-site rotation — each site's workers follow that site's page", () => {
  fresh(ARMED);
  const out = {};
  for (const host of ["alpha.test", "beta.test", "gamma.test", "delta.test"]) {
    const t = newTab();
    navigate(t, `https://${host}/`);
    const page = navigate(t, `https://${host}/2`);
    const ded = startWorker({ wg: page.wg });
    const shared = startWorker({ kind: "shared", origin: `https://${host}`, partitionKey: `(https,${host})` });
    assert.deepEqual(pick(ded), page.view(), `${host} dedicated`);
    assert.deepEqual(pick(shared), page.view(), `${host} shared`);
    out[host] = page.view();
  }
  const distinct = new Set(Object.values(out).map((v) => JSON.stringify(v)));
  assert.ok(distinct.size > 1, "rotation produces different personas across sites");
});

test("B3: third-party SharedWorker uses the top-level site of its partition", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  const w = startWorker({ kind: "shared", origin: "https://widget.other.test", partitionKey: "(https,alpha.test)" });
  assert.deepEqual(pick(w), page.view());
});

test("windowless worker requests carry the owning site's persona headers", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  const w = startWorker({ kind: "shared", origin: "https://alpha.test", partitionKey: "(https,alpha.test)" });
  const ch = fire(channel("https://alpha.test/shared.js", {
    bc: null, type: 2, triggering: principal("https://alpha.test/"), partitionKey: "(https,alpha.test)",
  }));
  assert.equal(ch.ua(), w.ua);
  assert.equal(ch.al(), prepareAcceptLanguages(w.languages));
  // Third-party worker fetch partitioned under alpha.test → alpha's persona.
  const tp = fire(channel("https://api.other.test/x", {
    bc: null, triggering: principal("https://widget.other.test/"), partitionKey: "(https,alpha.test)",
  }));
  assert.equal(tp.ua(), page.nav.userAgent);
  // Sticky: the site stays armed for its workers after the tab closes.
  t.close();
  const later = fire(channel("https://alpha.test/sw-fetch", {
    bc: null, triggering: principal("https://alpha.test/"),
  }));
  assert.equal(later.ua(), w.ua);
  // System / non-content principals stay native.
  const sys = fire(channel("https://alpha.test/ocsp", { bc: null, triggering: { isContentPrincipal: false } }));
  assert.equal(sys.ua(), NATIVE_UA);
});

test("windowless: site with only a native first document stays native", () => {
  fresh(ARMED);
  const t = newTab();
  const first = navigate(t, "https://gamma.test/");
  const w = startWorker({ kind: "shared", origin: "https://gamma.test", partitionKey: "(https,gamma.test)" });
  assert.equal(first.nav.userAgent, NATIVE_UA);
  assert.equal(w.ua, NATIVE_UA);
});

test("dedicated worker of a frame follows the top-level document", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const top = navigate(t, "https://alpha.test/2");
  const fbc = { id: nextId++, parent: t, top: t, currentURI: uri("https://frame.other.test/") };
  const fwg = makeWG(fbc, "https://frame.other.test/", top.wg);
  fbc.currentWindowGlobal = fwg;
  const w = startWorker({ wg: fwg });
  assert.deepEqual(pick(w), top.view());
});

test("pid mismatch on a window worker resolves native", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  page.wg.osPid = PID + 1;
  const r = W.resolveWorker({ innerWindowId: page.wg.innerWindowId }, PID);
  assert.equal(r.decision, "native");
  assert.equal(r.reason, "pid-mismatch");
});

// ------------------------------------------------------- depth prelude ---
test("depth prelude: 0043 OffscreenCanvas/WebGL/WebGPU only, never navigator", () => {
  fresh(ARMED);
  depthFor = () => ({ canvasSeed: 7, audioSeed: 9, webgpuSeed: 11, gpu: { vendor: "Apple", renderer: "Apple M2" } });
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  const w = startWorker({ wg: page.wg });
  assert.match(w.prelude, /OffscreenCanvas/);
  assert.match(w.prelude, /__s=7/);
  assert.match(w.prelude, /Apple M2/);
  assert.doesNotMatch(w.prelude, /userAgent|hardwareConcurrency|deviceMemory|languages|importScripts|createObjectURL/);
  // No depth armed → no script at all in the worker.
  depthFor = () => null;
  assert.equal(startWorker({ wg: page.wg }).prelude, "");
  // Native decision → no prelude even when depth would be available.
  depthFor = () => ({ canvasSeed: 7, audioSeed: 9 });
  const t2 = newTab();
  const n = navigate(t2, "https://beta.test/");
  assert.equal(startWorker({ wg: n.wg }).prelude, "");
});

// ------------------------------------------------------------ defaults ---
test("defaults (hooks off): C++ never asks chrome; plain Firefox 156 workers", () => {
  fresh({});
  syncCalls = 0;
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const p2 = navigate(t, "https://alpha.test/2");
  const w = startWorker({ wg: p2.wg });
  assert.equal(w.observed, false);
  assert.equal(w.ua, NATIVE_UA);
  assert.equal(W.getDiagnostics()["darkstr.worker.hooksArmed"], false);
  assert.equal(prefs.has("darkstr.worker.hooksArmed"), false, "0052: diag in memory only");
  // Even if asked, chrome answers "off".
  assert.equal(W.resolveWorker({ innerWindowId: p2.wg.innerWindowId }).decision, "off");
  for (const k of ["darkstr.mode", "darkstr.nativePersonaHooks"]) {
    assert.equal(prefs.has(k), false, `${k} untouched`);
  }
  const cpp = src("DarkstrNavigatorHooks.cpp");
  const resolve = cpp.slice(cpp.indexOf("::ResolveWorkerPersona("));
  assert.ok(
    resolve.indexOf("PollutionNativeHooksActive()") < resolve.indexOf("NotifyObservers("),
    "C++ gate precedes the observer"
  );
  assert.equal(syncCalls, 0, "no worker sync IPC with default prefs");
});

test("nativeCompatible / homogeneous disarm workers", () => {
  for (const extra of [{ "darkstr.nativeCompatible": true }, { "darkstr.mode": "homogeneous" }]) {
    fresh({ ...ARMED, ...extra });
    assert.equal(W.getPlan().armed, false);
    const t = newTab();
    navigate(t, "https://alpha.test/");
    const p2 = navigate(t, "https://alpha.test/2");
    assert.equal(startWorker({ wg: p2.wg }).ua, NATIVE_UA);
  }
});

// ------------------------------------------------------- source guards ---
test("one persona generator: no Firefox 135 list / Mac OS X 14.0 / worker generator", () => {
  const js = src("DarkstrWorkerHooks.sys.mjs");
  assert.doesNotMatch(js, /rv:135|Firefox\/135|Mac OS X 14\.0/);
  assert.doesNotMatch(js, /UA_GROUPS|_generatePersonaFromSeed|mulberry32|MEMORY\s*=/);
  assert.match(js, /DarkstrNativePersona/);
  assert.doesNotMatch(js, /registerWindowActor/);
  const reg = registered.process.find(([n]) => n === "DarkstrWorkerPersona");
  assert.ok(reg, "process actor registered");
  assert.deepEqual(reg[1].child.observers, [TOPIC]);
  assert.equal(reg[1].includeParent, false);
});

test("no Worker/SharedWorker wrapping, blob: scripts or JS navigator overrides", () => {
  const child = src("DarkstrWorkerHooksChild.sys.mjs");
  const code = child.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /createObjectURL|new Blob|importScripts\(|exportFunction|replaceConstructor/);
  assert.doesNotMatch(code, /deviceMemory/);
  assert.doesNotMatch(code, /spoof\("userAgent"|defineProperty\(nav,/);
  assert.doesNotMatch(code, /pageWindow\.(Worker|SharedWorker)/);
});

test("C++: WorkerNavigator serves the per-worker persona natively", () => {
  const nav = src("WorkerNavigator.cpp");
  assert.doesNotMatch(nav, /TryGetHardwareConcurrency|TryGetUserAgent|TryGetPlatform/);
  for (const fn of ["GetUserAgent", "GetPlatform", "HardwareConcurrency", "SetLanguages"]) {
    const body = nav.slice(nav.indexOf(`WorkerNavigator::${fn}(`));
    assert.match(body.slice(0, 1200), /PersonaForWorker\(/, `${fn} reads the worker persona`);
  }
  assert.doesNotMatch(nav, /DeviceMemory|deviceMemory/);
  const wp = src("WorkerPrivate.cpp");
  const ctor = wp.slice(wp.indexOf("WorkerPrivate::Constructor("));
  const iResolve = ctor.indexOf("ResolveWorkerPersona(");
  const iNew = ctor.indexOf("new WorkerPrivate(");
  const iReg = ctor.indexOf("RegisterWorkerPersona(");
  assert.ok(iResolve > 0 && iResolve < iNew && iNew < iReg, "resolve → construct → register");
  assert.match(wp, /WorkerPrivate::~WorkerPrivate\(\) \{\s*\/\/[^\n]*\n\s*DarkstrNavigatorHooks::ForgetWorkerPersona\(this\);/);
  const run = wp.slice(wp.indexOf("class CompileScriptRunnable"));
  assert.ok(run.indexOf("RunWorkerPrelude(") < run.indexOf("LoadMainScript("), "prelude before main script");
  const cpp = src("DarkstrNavigatorHooks.cpp");
  assert.match(cpp, /aLoadInfo\.mLanguageOverride = /);
  assert.match(cpp, /aLoadInfo\.mTimezoneOverride = /);
  assert.match(cpp, /if \(aParent\) \{[\s\S]{0,300}return PersonaForWorker\(aParent\);/);
  assert.match(cpp, /aIsChromeWorker\) \{\s*return nullptr;/);
});

test("persona versions and seed persistence untouched (N6 still open)", () => {
  // 0052 removed the stale 0051 NativePersona copy; compare the shipped
  // (0052) module with the 0049 one it was cut from.
  const np = src("DarkstrNativePersona.sys.mjs");
  const np49 = readFileSync(join(FILES, "DarkstrNativePersona.sys.mjs"), "utf8");
  const ua = (s) => s.slice(s.indexOf("const FIREFOX_UA_GROUPS"), s.indexOf("const CORES"));
  assert.ok(ua(np).length > 100);
  assert.equal(ua(np), ua(np49), "UA pool identical to 0049");
  const readSnap = (s) => s.slice(s.indexOf("  _readSnapshot() {"), s.indexOf("  _readSnapshotFromFfi("));
  assert.ok(readSnap(np).length > 100);
  assert.equal(readSnap(np), readSnap(np49), "seed/snapshot persistence identical to 0049");
});

// ------------------------------------------------------------- 0049r2 ---
// Proof #81 F1: a popup's dedicated worker had a native navigator / script
// load but its own requests went out with the opener site's persona (site
// rule). Every dedicated-worker request must use the worker's own decision.

/** All HTTP a dedicated worker makes, as Gecko labels it. */
function workerTraffic(origin, ownerWg) {
  const bc = ownerWg.browsingContext;
  const trig = principal(origin + "/");
  return {
    // Main script: loaded with the creating document as loading node.
    script: fire(channel(origin + "/w/ded.js", { bc, type: 2, wg: ownerWg, triggering: trig })),
    // In-worker: no window, no browsingContext; associatedBrowsingContext set.
    importScripts: fire(channel(origin + "/w/lib.js", { bc: null, type: 2, triggering: trig, assoc: bc })),
    fetch: fire(channel(origin + "/echo?t=ded-f", { bc: null, type: 20, triggering: trig, assoc: bc })),
    xhr: fire(channel(origin + "/echo?t=ded-x", { bc: null, type: 20, triggering: trig, assoc: bc })),
    nestedImport: fire(channel(origin + "/w/inner.js", { bc: null, type: 2, triggering: trig, assoc: bc })),
  };
}
function assertOneSource(w, traffic, label) {
  for (const [k, ch] of Object.entries(traffic)) {
    assert.equal(ch.ua(), w.ua, `${label}: ${k} UA == worker navigator`);
    assert.equal(ch.al(), prepareAcceptLanguages(w.languages), `${label}: ${k} Accept-Language == worker navigator.languages`);
  }
}
function openPopup(openerTab, { noopener = false } = {}) {
  const p = newTab();
  if (noopener) p.crossGroupOpener = openerTab;
  else p.opener = openerTab;
  return p;
}

for (const [name, setup] of Object.entries(SETUPS)) {
  test(`0049r2 (${name}): about:blank popup — w.Worker from the opener: navigator, tz, script load and all worker HTTP == popup == opener`, () => {
    fresh(setup);
    const t = newTab();
    navigate(t, "https://alpha.test/");
    const opener = navigate(t, "https://alpha.test/2");
    const ov = opener.view();
    assert.notEqual(ov.ua, NATIVE_UA);
    const p = openPopup(t);
    // about:blank inherits the opener's principal (no document channel).
    const pwg = makeWG(p, "https://alpha.test/2");
    p.currentWindowGlobal = pwg;
    p.currentURI = uri("about:blank");
    p.timezoneOverride = t.timezoneOverride; // BC field inherited by the popup
    const w = startWorker({ wg: pwg }); // new w.Worker(): creating window = popup
    assert.deepEqual(pick(w), ov, `${name}: popup worker navigator == opener persona`);
    assertOneSource(w, workerTraffic("https://alpha.test", pwg), `${name} popup`);
    if (name === "locked") assert.equal(w.tz, "Europe/London");
  });
}

test("0049r2: popup's own script (URL popup) creates the worker: same single source", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const opener = navigate(t, "https://alpha.test/2");
  const p = openPopup(t);
  const pop = navigate(p, "https://alpha.test/popup");
  assert.equal(pop.nav.userAgent, opener.nav.userAgent, "URL popup inherits the opener (0051r2)");
  const w = startWorker({ wg: pop.wg });
  assert.equal(w.ua, opener.nav.userAgent);
  assertOneSource(w, workerTraffic("https://alpha.test", pop.wg), "URL popup");
});

test("0049r2: native first document of an armed site — its dedicated worker's HTTP stays native (was: site rule → armed)", () => {
  fresh(ARMED);
  const a = newTab();
  navigate(a, "https://alpha.test/");
  const armedPage = navigate(a, "https://alpha.test/2");
  assert.notEqual(armedPage.nav.userAgent, NATIVE_UA);
  const b = newTab(); // user-opened tab, first document: native (strictFirstDoc)
  const first = navigate(b, "https://alpha.test/other");
  assert.equal(first.nav.userAgent, NATIVE_UA);
  const w = startWorker({ wg: first.wg });
  assert.equal(w.ua, NATIVE_UA);
  const tr = workerTraffic("https://alpha.test", first.wg);
  assertOneSource(w, tr, "native first doc");
  assert.equal(tr.fetch.ua(), NATIVE_UA);
  // ... while the armed tab's worker is armed, from the same site.
  const wa = startWorker({ wg: armedPage.wg });
  assert.equal(wa.ua, armedPage.nav.userAgent);
  assertOneSource(wa, workerTraffic("https://alpha.test", armedPage.wg), "armed tab");
});

test("0049r2: frame's dedicated worker HTTP == top document persona == worker navigator", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const top = navigate(t, "https://alpha.test/2");
  const fbc = { id: nextId++, parent: t, top: t, currentURI: uri("https://frame.other.test/") };
  const fwg = makeWG(fbc, "https://frame.other.test/", top.wg);
  fbc.currentWindowGlobal = fwg;
  const w = startWorker({ wg: fwg });
  assert.equal(w.ua, top.nav.userAgent);
  assertOneSource(w, workerTraffic("https://frame.other.test", fwg), "frame worker");
});

test("0049r2: Shared/Service worker requests (no associated BC) keep the site rule", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  const b = newTab();
  navigate(b, "https://alpha.test/x"); // native first doc of the same site
  const sh = startWorker({ kind: "shared", origin: "https://alpha.test", partitionKey: "(https,alpha.test)" });
  assert.equal(sh.ua, page.nav.userAgent);
  const ch = fire(channel("https://alpha.test/shared-fetch", {
    bc: null, triggering: principal("https://alpha.test/"), partitionKey: "(https,alpha.test)",
  }));
  assert.equal(ch.ua(), sh.ua);
});

test("0049r2: defaults — dedicated worker requests untouched (plain Firefox 156)", () => {
  fresh({});
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const page = navigate(t, "https://alpha.test/2");
  const tr = workerTraffic("https://alpha.test", page.wg);
  for (const ch of Object.values(tr)) {
    assert.equal(ch.ua(), NATIVE_UA);
    assert.equal(ch.al(), NATIVE_AL);
  }
});

test("0049r2 C++: nested worker main script carries the owning window's BC (gated; default stock)", () => {
  const sl = src("ScriptLoader.cpp");
  const run = sl.slice(sl.indexOf("class ChannelGetterRunnable"));
  const body = run.slice(0, run.indexOf("GetResult()"));
  const iChan = body.indexOf("ChannelFromScriptURLMainThread(");
  const iGate = body.indexOf("DarkstrNavigatorHooks::PollutionNativeHooksActive()");
  const iSet = body.indexOf("SetAssociatedBrowsingContextID(bcID)");
  const iPrin = body.indexOf("SetPrincipalsAndCSPFromChannel(channel)");
  assert.ok(iChan > 0 && iChan < iGate && iGate < iSet && iSet < iPrin, "channel → gate → label → principals");
  assert.match(body, /workerPrivate->AssociatedBrowsingContextID\(\)/, "parent worker's owning window BC");
  assert.match(sl, /#include "DarkstrNavigatorHooks\.h"/);
  // Only the include and that one block are touched.
  assert.equal((sl.match(/darkstr 0049r2/g) || []).length, 2);
});

test("0049r2: nested worker main script (labelled by C++) == nested navigator == owning document", () => {
  fresh(ARMED);
  const a = newTab();
  navigate(a, "https://alpha.test/");
  navigate(a, "https://alpha.test/2"); // armed same-site tab
  const b = newTab();
  const first = navigate(b, "https://alpha.test/other"); // native first doc
  const outer = startWorker({ wg: first.wg });
  const trig = principal("https://alpha.test/");
  const nestedMain = fire(channel("https://alpha.test/w/inner.js", { bc: null, type: 2, triggering: trig, assoc: b }));
  assert.equal(nestedMain.ua(), outer.ua);
  assert.equal(nestedMain.ua(), NATIVE_UA);
  // Without the C++ label (stock Gecko) it would fall to the site rule (armed): documents the gap the label closes.
  const unlabelled = fire(channel("https://alpha.test/w/inner.js", { bc: null, type: 2, triggering: trig }));
  assert.notEqual(unlabelled.ua(), NATIVE_UA);
});
