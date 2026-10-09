/**
 * 0051: persona surface (Rowan QA N2–N5) — behavioural tests against the
 * shipped modules in patches/0051-files with minimal XPCOM / DOM stubs.
 * 0052: DarkstrNativePersona ships from patches/0052-files (the stale 0051
 * copy was removed); every other module still ships from 0051-files.
 * 0053: NativePersona / ModeXor ship from patches/0053-files.
 *
 *   N2  HTTP User-Agent phase is per tab / per document, never a global pref:
 *       a new tab cannot flip other tabs; redirects are not extra navigations.
 *   N3  Accept-Language comes from the same per-site persona as that page's
 *       navigator.languages, per request and per top-level site (Gecko format).
 *   N4  No deviceMemory / userAgentData; overrides live on Navigator.prototype
 *       with native-shaped getters (no own properties, no darkstr names).
 *   N5  A seed with rotation off never writes darkstr.persona.snapshot; locking
 *       is explicit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = join(root, "patches/0051-files");
const FILES52 = join(root, "patches/0052-files");
// Newest shipped copy of a module (later pins supersede earlier ones).
const NEWER = ["0058-files", "0057c-files", "0057-files", "0056-files", "0055-files", "0053r2-files", "0053-files", "0052-files"].map((d) => join(root, "patches", d));
const newest = (f, fallbackDir) => {
  for (const d of NEWER) {
    if (existsSync(join(d, f))) return join(d, f);
  }
  return join(fallbackDir, f);
};
const shipped = (f) => newest(f, FILES);
const src = (f) => readFileSync(shipped(f), "utf8");

// 0055 (N6): a macOS persona now claims the engine's own UA, byte-identical
// to the real native one. The stub's native value carries a marker so these
// tests can still see which layer answered (persona vs native); the real
// equality is asserted in persona-ff156-0055.test.mjs.
const REAL_NATIVE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0";
const NATIVE_UA = REAL_NATIVE_UA + " (test: native header)";
const NATIVE_LANGS = ["en-US", "en"];
const NATIVE_AL = "en-US,en;q=0.9";
const PID = 4242;

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
const writes = [];
globalThis.Services = {
  // 0055: personas derive their Firefox version from the engine.
  appinfo: { version: "156.0.1", name: "LibreWolf" },
  prefs: {
    getBoolPref: getP,
    getStringPref: getP,
    getCharPref: getP,
    getIntPref: getP,
    setBoolPref: (k, v) => (writes.push(k), setP(k, v)),
    setStringPref: (k, v) => (writes.push(k), setP(k, v)),
    setCharPref: (k, v) => (writes.push(k), setP(k, v)),
    setIntPref: (k, v) => (writes.push(k), setP(k, v)),
    prefHasUserValue: (k) => prefs.has(k),
    clearUserPref: (k) => prefs.delete(k),
    addObserver() {},
    removeObserver() {},
  },
  eTLD: {
    getBaseDomain: (u) => u.host.split(".").slice(-2).join("."),
    getBaseDomainFromHost: (h) => h.split(".").slice(-2).join("."),
  },
  locale: {
    get acceptLanguages() {
      return getP("intl.accept_languages", "en-US, en");
    },
  },
  obs: { addObserver() {}, removeObserver() {} },
  ppmm: {
    addMessageListener: (n, l) => (ppmmListeners[n] = l),
    removeMessageListener: (n) => delete ppmmListeners[n],
  },
  cpmm: {
    sendSyncMessage: (name, data) => [
      ppmmListeners[name]?.receiveMessage({ name, data, target: { osPid: PID } }),
    ],
  },
  wm: { getEnumerator: () => [] },
};
globalThis.Cc = {
  "@mozilla.org/network/protocol;1?name=http": {
    getService: () => ({ oscpu: "Intel Mac OS X 10.15" }),
  },
};
globalThis.Ci = {
  nsIHttpChannel: {},
  nsIHttpProtocolHandler: {},
  nsIContentPolicy: { TYPE_DOCUMENT: 6, TYPE_SUBDOCUMENT: 7, TYPE_FETCH: 20 },
};
globalThis.Cu = {
  waiveXrays: (x) => x,
  unwaiveXrays: (x) => x,
  exportFunction: (f) => f,
  cloneInto: (v) => (Array.isArray(v) ? v.slice() : structuredClone(v)),
};
globalThis.ChromeUtils = {
  importESModule() {
    throw new Error("no FFI in node");
  },
  defineESModuleGetters() {},
  registerWindowActor() {},
  unregisterWindowActor() {},
};
globalThis.JSWindowActorChild = class {};
globalThis.JSWindowActorParent = class {};
const wgById = new Map();
globalThis.WindowGlobalParent = { getByInnerWindowId: (id) => wgById.get(id) || null };

const personaMod = await import(pathToFileURL(shipped("DarkstrNativePersona.sys.mjs")));
const childMod = await import(pathToFileURL(shipped("DarkstrNativePersonaChild.sys.mjs")));
const P = personaMod.DarkstrNativePersona;
const { prepareAcceptLanguages } = personaMod;

// ------------------------------------------------------- fake Gecko ---
function uri(url) {
  const u = new URL(url);
  return { spec: url, scheme: u.protocol.slice(0, -1), host: u.hostname, asciiHost: u.hostname };
}
function principal(url) {
  const u = new URL(url);
  return {
    isContentPrincipal: /^(https?|file):$/.test(u.protocol),
    URI: uri(url),
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
  return bc;
}
function channel(url, { bc, type = 20, wg = null, headers = {}, redirect = false } = {}) {
  const h = new Map(
    Object.entries({ "User-Agent": NATIVE_UA, "Accept-Language": NATIVE_AL, ...headers })
  );
  return {
    URI: uri(url),
    originalURI: uri(url),
    loadInfo: {
      externalContentPolicyType: type,
      isTopLevelLoad: type === 6 && !bc?.parent,
      browsingContext: bc,
      innerWindowID: wg ? wg.innerWindowId : 0,
      redirectChainIncludingInternalRedirects: redirect ? [{}] : [],
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
/** Top-level navigation: document channel, then the new document. */
function navigate(bc, url, opts = {}) {
  const ch = fire(channel(url, { bc, type: 6, ...opts }));
  const wg = makeWG(bc, url);
  bc.currentURI = uri(url);
  bc.currentWindowGlobal = wg;
  return { ch, wg, page: page(wg, url) };
}
function addFrame(topBc, url) {
  const bc = { id: nextId++, parent: topBc, top: topBc, currentURI: uri(url) };
  fire(channel(url, { bc, type: 7, wg: topBc.currentWindowGlobal }));
  const wg = makeWG(bc, url, topBc.currentWindowGlobal);
  bc.currentWindowGlobal = wg;
  return { bc, wg, page: page(wg, url) };
}
function request(wg, url, headers) {
  return fire(channel(url, { bc: wg.browsingContext, wg, headers }));
}

/** Page window with a native-shaped Navigator.prototype (accessors). */
function makeWindow() {
  const brand = new WeakSet();
  const check = (self, name) => {
    if (!brand.has(self)) {
      throw new TypeError(`'get ${name}' called on an object that does not implement interface Navigator.`);
    }
  };
  const langs = Object.freeze(NATIVE_LANGS.slice());
  const proto = {};
  const natives = {
    get userAgent() { check(this, "userAgent"); return NATIVE_UA; },
    get platform() { check(this, "platform"); return "MacIntel"; },
    get appVersion() { check(this, "appVersion"); return "5.0 (Macintosh)"; },
    get oscpu() { check(this, "oscpu"); return "Intel Mac OS X 10.15"; },
    get hardwareConcurrency() { check(this, "hardwareConcurrency"); return 8; },
    get language() { check(this, "language"); return "en-US"; },
    get languages() { check(this, "languages"); return langs; },
    get webdriver() { check(this, "webdriver"); return false; },
  };
  for (const k of Object.keys(natives)) {
    const d = Object.getOwnPropertyDescriptor(natives, k);
    Object.defineProperty(proto, k, { get: d.get, enumerable: true, configurable: true });
  }
  function Navigator() {}
  Navigator.prototype = proto;
  const navigator = Object.create(proto);
  brand.add(navigator);
  return { Navigator, navigator, Object, nativeDescs: Object.getOwnPropertyDescriptors(proto) };
}
function page(wg, url) {
  const window = makeWindow();
  const actor = new childMod.DarkstrNativePersonaChild();
  actor.manager = { innerWindowId: wg.innerWindowId };
  actor.document = { nodePrincipal: principal(url) };
  actor.contentWindow = window;
  actor.handleEvent({ type: "DOMWindowCreated" });
  return { window, actor, nav: window.navigator };
}

function fresh(extra = {}) {
  if (P._inited) P.uninit();
  prefs.clear();
  writes.length = 0;
  for (const [k, v] of Object.entries(extra)) prefs.set(k, v);
  P._plan = null;
  P.init();
}
const ARMED = { "darkstr.mode": "pollution", "darkstr.nativePersonaHooks": true };

// ------------------------------------------------------------------ N2 ---
test("N2: opening a new tab never flips existing tabs to the native UA", () => {
  fresh(ARMED);
  const t1 = newTab();
  const a1 = navigate(t1, "https://www.alpha.test/");
  assert.equal(a1.ch.ua(), NATIVE_UA, "first document of tab 1 native (strictFirstDoc)");
  assert.equal(a1.page.nav.userAgent, NATIVE_UA);
  const a2 = navigate(t1, "https://www.alpha.test/2");
  assert.notEqual(a2.ch.ua(), NATIVE_UA, "second document armed");
  assert.equal(a2.page.nav.userAgent, a2.ch.ua(), "document UA == navigator UA");

  const t2 = newTab();
  navigate(t2, "https://beta.test/");
  const b2 = navigate(t2, "https://beta.test/2");
  assert.equal(b2.page.nav.userAgent, b2.ch.ua());

  // Third tab: first document, native.
  const t3 = newTab();
  const c1 = navigate(t3, "https://gamma.test/");
  assert.equal(c1.ch.ua(), NATIVE_UA);
  assert.equal(c1.page.nav.userAgent, NATIVE_UA);
  assert.equal(P.getDiagnostics()["darkstr.persona.docShellPhase"], "first_document",
    "global diag mirror says first_document (proves nobody reads it)");
  assert.equal(prefs.has("darkstr.persona.docShellPhase"), false,
    "0052: diag mirror stays in memory (darkstr.debug.diagPrefs off)");

  // Tabs 1 and 2 keep their persona on every later request.
  for (const [p, wg, host] of [[a2.page, a2.wg, "alpha.test"], [b2.page, b2.wg, "beta.test"]]) {
    for (const url of [`https://${host}/x.js`, "https://cdn.other.test/lib.js"]) {
      const ch = request(wg, url);
      assert.equal(ch.ua(), p.nav.userAgent, `${url} from ${host}: HTTP UA == navigator UA`);
      assert.equal(ch.al(), prepareAcceptLanguages(p.nav.languages));
    }
  }
  // A new document in tab 1 right after tab 3's first document: still armed.
  const a3 = navigate(t1, "https://alpha.test/3");
  assert.notEqual(a3.ch.ua(), NATIVE_UA, "tab 1 third document armed after tab 3 opened");
  assert.equal(a3.page.nav.userAgent, a3.ch.ua());
  assert.equal(request(a3.wg, "https://alpha.test/z").ua(), a3.page.nav.userAgent);
  const c2 = request(c1.wg, "https://gamma.test/x.js");
  assert.equal(c2.ua(), NATIVE_UA, "tab 3 first document stays native");
  assert.equal(c2.al(), NATIVE_AL);
  // Tab 3 arms on its own second navigation; tabs 1/2 unaffected.
  const c3 = navigate(t3, "https://gamma.test/2");
  assert.notEqual(c3.page.nav.userAgent, NATIVE_UA);
  assert.equal(request(a2.wg, "https://alpha.test/y").ua(), a2.page.nav.userAgent);
});

test("N2: redirects (incl. internal) are not counted as navigations", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "http://alpha.test/");
  const r = fire(channel("https://alpha.test/", { bc: t, type: 6, redirect: true }));
  assert.equal(r.ua(), NATIVE_UA, "redirect target of the first document stays native");
  assert.equal(P.tabPhase(t), "first_document");
  const n = navigate(t, "https://alpha.test/next");
  assert.notEqual(n.ch.ua(), NATIVE_UA);
});

test("N2: frames and their requests use the top-level document's decision", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const top = navigate(t, "https://alpha.test/2");
  const f = addFrame(t, "https://widget.other.test/frame");
  assert.equal(f.page.nav.userAgent, top.page.nav.userAgent);
  assert.deepEqual([...f.page.nav.languages], [...top.page.nav.languages]);
  const ch = request(f.wg, "https://widget.other.test/api");
  assert.equal(ch.ua(), top.page.nav.userAgent);
  assert.equal(ch.al(), prepareAcceptLanguages(top.page.nav.languages));
  // No browsing context (Shared/Service worker): native headers (0049 residual).
  const sw = fire(channel("https://alpha.test/sw.js", { bc: null }));
  assert.equal(sw.ua(), NATIVE_UA);
});

test("N2: the global phase pref and C++ global UA override are gone from decisions", () => {
  const js = src("DarkstrNativePersona.sys.mjs");
  assert.doesNotMatch(js, /getStringPref\(\s*DOCSHELL_PHASE_MIRROR_PREF/);
  const cpp = src("DarkstrNsHttpHooks.cpp");
  assert.match(cpp, /UserAgentOverride\(\) \{[^}]*return nullptr;\s*\}/);
  assert.doesNotMatch(cpp, /darkstr\.persona\.docShellPhase/);
  const nav = src("Navigator.cpp");
  assert.doesNotMatch(nav, /DarkstrNavigatorHooks::TryGet/);
});

test("N2: a fixed persona (strictFirstDoc=false) applies from the first document", () => {
  fresh({ ...ARMED, "darkstr.strictFirstDoc": false });
  const t = newTab();
  const a = navigate(t, "https://alpha.test/");
  assert.notEqual(a.ch.ua(), NATIVE_UA);
  assert.equal(a.page.nav.userAgent, a.ch.ua());
});

// ------------------------------------------------------------------ N3 ---
test("N3: Accept-Language formatting matches Gecko rust_prepare_accept_languages", () => {
  assert.equal(prepareAcceptLanguages(["en-US", "en"]), "en-US,en;q=0.9");
  assert.equal(prepareAcceptLanguages("en-US, en"), "en-US,en;q=0.9");
  assert.equal(prepareAcceptLanguages(["en-gb", "EN"]), "en-GB,en;q=0.9");
  assert.equal(prepareAcceptLanguages("zh-hant-tw, de-x-ab, es-419"), "zh-Hant-TW,de-x-ab;q=0.9,es-419;q=0.8");
  assert.equal(prepareAcceptLanguages(" fr ;q=0.5 , ,de"), "fr,de;q=0.9");
  const many = Array.from({ length: 12 }, (_, i) => "l" + String.fromCharCode(97 + i));
  assert.match(prepareAcceptLanguages(many), /lk;q=0\.1,ll;q=0\.1$/);
  assert.equal(prepareAcceptLanguages(""), "");
});

function sitesWithDifferentLanguages() {
  const seen = new Map();
  for (let i = 0; i < 200; i++) {
    const host = `site${i}.test`;
    const snap = P.resolveSnapshotForUri(uri(`https://${host}/`));
    const key = snap.languages.join(",");
    if (!seen.has(key)) seen.set(key, host);
    if (seen.size === 2) return [...seen.values()];
  }
  throw new Error("no two sites with different persona languages");
}

test("N3: Accept-Language follows each tab's own persona, interleaved, no global writes", () => {
  fresh(ARMED);
  const [hostA, hostB] = sitesWithDifferentLanguages();
  const tabs = [];
  for (const host of [hostA, hostB]) {
    const t = newTab();
    navigate(t, `https://${host}/`);
    tabs.push(navigate(t, `https://${host}/2`));
  }
  assert.notDeepEqual([...tabs[0].page.nav.languages], [...tabs[1].page.nav.languages]);
  for (let round = 0; round < 3; round++) {
    for (const d of tabs) {
      const ch = request(d.wg, "https://shared-cdn.test/x.css");
      assert.equal(ch.al(), prepareAcceptLanguages(d.page.nav.languages));
      assert.equal(d.page.nav.language, d.page.nav.languages[0]);
    }
  }
  assert.ok(!writes.includes("intl.accept_languages"), "intl.accept_languages never written");
  assert.ok(!writes.includes("darkstr.persona.languages"), "no global languages mirror");
});

test("N3: a page-set Accept-Language is left alone", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const d = navigate(t, "https://alpha.test/2");
  const ch = request(d.wg, "https://alpha.test/api", { "Accept-Language": "fr-FR" });
  assert.equal(ch.al(), "fr-FR");
  assert.equal(ch.ua(), d.page.nav.userAgent);
});

test("N3: a global accept-languages saved by an older build is restored once", () => {
  fresh({
    ...ARMED,
    "intl.accept_languages": "en-GB,en",
    "darkstr.persona.savedAcceptLanguages": "de-DE, de",
    "darkstr.persona.languages": "en-GB,en",
  });
  assert.equal(prefs.get("intl.accept_languages"), "de-DE, de");
  assert.ok(!prefs.has("darkstr.persona.savedAcceptLanguages"));
  assert.ok(!prefs.has("darkstr.persona.languages"));
});

// ------------------------------------------------------------------ N4 ---
test("N4: navigator persona has no deviceMemory/userAgentData and no own properties", () => {
  fresh(ARMED);
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const { page: p } = navigate(t, "https://alpha.test/2");
  const nav = p.nav;
  assert.notEqual(nav.userAgent, NATIVE_UA, "persona installed");
  assert.equal("deviceMemory" in nav, false);
  assert.equal("userAgentData" in nav, false);
  assert.deepEqual(Object.getOwnPropertyNames(nav), []);
  assert.deepEqual(
    Object.keys(childMod.personaValuesFor(p.window)).sort(),
    // 0058: appVersion / oscpu follow the persona's OS (stock Firefox fields)
    ["appVersion", "hardwareConcurrency", "language", "languages", "oscpu", "platform", "userAgent"]
  );
  const proto = p.window.Navigator.prototype;
  for (const prop of ["userAgent", "platform", "appVersion", "oscpu", "hardwareConcurrency", "language", "languages"]) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    const n = p.window.nativeDescs[prop];
    assert.notEqual(d.get, n.get, `${prop} hooked on the prototype`);
    assert.equal(d.get.name, `get ${prop}`);
    assert.doesNotMatch(d.get.name, /darkstr/i);
    assert.equal(d.get.length, n.get.length);
    assert.equal(d.enumerable, n.enumerable);
    assert.equal(d.configurable, n.configurable);
    assert.equal(d.set, undefined);
    assert.throws(() => d.get.call({}), TypeError, "foreign receiver → native TypeError");
  }
  // Untouched native members stay native.
  assert.equal(Object.getOwnPropertyDescriptor(proto, "webdriver").get, p.window.nativeDescs.webdriver.get);
  assert.equal(nav.languages, nav.languages, "same array every read ([Cached])");
  assert.ok(Object.isFrozen(nav.languages));
});

test("N4: native first document keeps the native accessors; refresh restores them", () => {
  fresh(ARMED);
  const t = newTab();
  const first = navigate(t, "https://alpha.test/");
  const proto = first.page.window.Navigator.prototype;
  for (const [k, d] of Object.entries(first.page.window.nativeDescs)) {
    assert.equal(Object.getOwnPropertyDescriptor(proto, k).get, d.get, `${k} native`);
  }
  const second = navigate(t, "https://alpha.test/2");
  assert.notEqual(second.page.nav.userAgent, NATIVE_UA);
  // Hooks switched off → refresh → native again (accessors restored).
  prefs.set("darkstr.nativePersonaHooks", false);
  P.refreshPlan();
  second.page.actor.receiveMessage({ name: "DarkstrNativePersona:Refresh" });
  const proto2 = second.page.window.Navigator.prototype;
  for (const [k, d] of Object.entries(second.page.window.nativeDescs)) {
    assert.equal(Object.getOwnPropertyDescriptor(proto2, k).get, d.get, `${k} restored`);
  }
  assert.equal(second.page.nav.userAgent, NATIVE_UA);
});

test("N4: default prefs — no IPC, no hooks, no header changes", () => {
  fresh();
  let calls = 0;
  const sync = Services.cpmm.sendSyncMessage;
  Services.cpmm.sendSyncMessage = (...a) => (calls++, sync(...a));
  const t = newTab();
  navigate(t, "https://alpha.test/");
  const d = navigate(t, "https://alpha.test/2");
  Services.cpmm.sendSyncMessage = sync;
  assert.equal(calls, 0);
  assert.equal(d.ch.ua(), NATIVE_UA);
  assert.equal(d.ch.al(), NATIVE_AL);
  assert.equal(d.page.nav.userAgent, NATIVE_UA);
  assert.equal(P._actorRegistered, false, "actor not even registered while idle");
});

test("N4: shipped child source carries no Chrome-only surface or branded getter", () => {
  const child = src("DarkstrNativePersonaChild.sys.mjs");
  assert.doesNotMatch(child, /darkstrNavGetter/);
  assert.doesNotMatch(child, /function\s+darkstr/i);
  assert.doesNotMatch(child, /\["deviceMemory"|"userAgentData"|'deviceMemory'/);
  assert.doesNotMatch(child, /defineProperty\(\s*(nav|navigator)\b/);
  assert.match(child, /Navigator\?\.prototype/);
  // exportFunction keeps the compiled name: computed accessor keys export as
  // anonymous functions (runtime: name "" / "function () {[native code]}").
  assert.doesNotMatch(child, /get \[/);
  assert.doesNotMatch(src("DarkstrCookieFirewallChild.sys.mjs"), /get \[/);
  const parent = src("DarkstrNativePersonaParent.sys.mjs");
  assert.doesNotMatch(parent, /languageOverride = primary/, "no languageOverride pulse");
});

// ------------------------------------------------------------------ N5 ---
test("N5: a seed with rotation off does not write darkstr.persona.snapshot", () => {
  fresh({ ...ARMED, "darkstr.persona.seed": 42, "darkstr.persona.rotatePerSite": false });
  const plan = P.getPlan();
  assert.ok(plan.snapshot?.userAgent, "rotation off → one global persona from the seed");
  assert.equal(plan.rotatePerSite, false);
  assert.ok(!prefs.has("darkstr.persona.snapshot"), "no implicit lock written");
  assert.ok(!writes.includes("darkstr.persona.snapshot"));
  // Turning rotation back on resumes rotation.
  prefs.set("darkstr.persona.rotatePerSite", true);
  P.refreshPlan();
  assert.equal(P._rotationLocked(), false);
  assert.equal(P.getPlan().rotatePerSite, true);
  assert.equal(P.getPlan().snapshot, null);
});

test("N5: locking is explicit — a pasted snapshot locks and is used verbatim (0055: Firefox version = engine)", () => {
  const pasted = {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:139.0) Gecko/20100101 Firefox/139.0",
    platform: "MacIntel",
    hardwareConcurrency: 4,
    languages: ["en-GB", "en"],
  };
  fresh({ ...ARMED, "darkstr.strictFirstDoc": false, "darkstr.persona.snapshot": JSON.stringify(pasted) });
  assert.equal(P._rotationLocked(), true);
  const t1 = newTab();
  const t2 = newTab();
  const a = navigate(t1, "https://alpha.test/");
  const b = navigate(t2, "https://beta.test/");
  // 0055 (N6): the lock keeps its OS token and fields; the 139 claim becomes
  // the engine's version.
  const lockedUa = pasted.userAgent.replace(/139\.0/g, "156.0");
  for (const d of [a, b]) {
    assert.equal(d.ch.ua(), lockedUa);
    assert.equal(d.page.nav.userAgent, lockedUa);
    assert.equal(d.ch.al(), "en-GB,en;q=0.9");
  }
  assert.equal(prefs.get("darkstr.persona.snapshot"), JSON.stringify(pasted), "pref untouched");
});

// ------------------------------------------------------------------ 0058 ---
// Proof 0055r2 note: a pasted Win32 lock showed navigator.platform Win32 with
// the host's appVersion "5.0 (Macintosh)". OS-derived fields follow the UA OS.
for (const [label, pasted, want] of [
  ["Win32 without appVersion", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0", platform: "Win32", hardwareConcurrency: 8, languages: ["en-US", "en"] },
    { platform: "Win32", appVersion: "5.0 (Windows)", oscpu: "Windows NT 10.0; Win64; x64" }],
  ["Windows UA, platform MacIntel and a Mac appVersion", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0", platform: "MacIntel", appVersion: "5.0 (Macintosh)" },
    { platform: "Win32", appVersion: "5.0 (Windows)", oscpu: "Windows NT 10.0; Win64; x64" }],
  ["Ubuntu", { userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0" },
    { platform: "Linux x86_64", appVersion: "5.0 (X11)", oscpu: "Linux x86_64" }],
]) {
  test(`0058: pasted lock (${label}) → platform-correct appVersion / oscpu / platform`, () => {
    fresh({ ...ARMED, "darkstr.strictFirstDoc": false, "darkstr.persona.snapshot": JSON.stringify(pasted) });
    const { page: p, ch } = navigate(newTab(), "https://alpha.test/");
    for (const [k, v] of Object.entries(want)) assert.equal(p.nav[k], v, k);
    assert.match(ch.ua(), /rv:156\.0\) Gecko\/20100101 Firefox\/156\.0$/);
    assert.equal(p.nav.userAgent, ch.ua());
    const w = P.workerPersonaFields(P.getPlan().snapshot);
    assert.equal(w.appVersion, want.appVersion, "worker appVersion");
    assert.equal(w.platform, want.platform, "worker platform");
    assert.equal(prefs.get("darkstr.persona.snapshot"), JSON.stringify(pasted), "pref untouched");
  });
}

test("0058: a seeded (host-OS) persona keeps the host's appVersion / oscpu", () => {
  fresh({ ...ARMED, "darkstr.strictFirstDoc": false, "darkstr.persona.seed": 42, "darkstr.persona.rotatePerSite": false });
  const { page: p } = navigate(newTab(), "https://alpha.test/");
  assert.equal(p.nav.platform, "MacIntel");
  assert.equal(p.nav.appVersion, "5.0 (Macintosh)");
  assert.equal(p.nav.oscpu, "Intel Mac OS X 10.15");
});

test("N5: seed path is cached per seed and follows seed changes", () => {
  fresh({ ...ARMED, "darkstr.persona.seed": 42, "darkstr.persona.rotatePerSite": false });
  const s42 = P.getPlan().snapshot;
  P.refreshPlan();
  assert.equal(P.getPlan().snapshot, s42, "same object (no regeneration per refresh)");
  prefs.set("darkstr.persona.seed", 43);
  P.refreshPlan();
  assert.equal(P._lockedSnapCache.seed, 43);
  assert.ok(!prefs.has("darkstr.persona.snapshot"));
});

// ------------------------------------------------- 0051r2: popups (Proof F1) ---
/** Script-opened top-level context (window.open). noopener: opener stays null. */
function openPopup(openerBc, { noopener = false } = {}) {
  const bc = newTab();
  bc.opener = noopener ? null : openerBc;
  bc.crossGroupOpener = openerBc; // Gecko sets this for every window.open
  return bc;
}
/** Initial about:blank of a popup: inherits the opener's http(s) principal. */
function blankDoc(bc, openerUrl) {
  const wg = makeWG(bc, openerUrl);
  wg.documentURI = uri("about:blank");
  bc.currentURI = uri("about:blank");
  bc.currentWindowGlobal = wg;
  return { wg, page: page(wg, openerUrl) };
}
function liveTabs(...bcs) {
  Services.wm.getEnumerator = () => [{ gBrowser: { browsers: bcs.map((browsingContext) => ({ browsingContext })) } }];
}
function same(p, ref, label) {
  for (const k of ["userAgent", "platform", "hardwareConcurrency", "language"]) {
    assert.equal(p.nav[k], ref.nav[k], `${label}: navigator.${k}`);
  }
  assert.deepEqual([...p.nav.languages], [...ref.nav.languages], `${label}: languages`);
}

test("0051r2 popup: window.open('about:blank') inherits the opener's persona (navigator + HTTP)", () => {
  fresh(ARMED);
  const t1 = newTab();
  navigate(t1, "https://alpha.test/");
  const a2 = navigate(t1, "https://alpha.test/2");
  assert.notEqual(a2.page.nav.userAgent, NATIVE_UA, "opener armed");
  const pop = openPopup(t1);
  const b = blankDoc(pop, "https://alpha.test/2");
  same(b.page, a2.page, "about:blank popup at 0 ms");
  const ch = request(b.wg, "https://alpha.test/echo");
  assert.equal(ch.ua(), a2.page.nav.userAgent, "popup request UA");
  assert.equal(ch.al(), prepareAcceptLanguages(a2.page.nav.languages), "popup request AL");
  // later same-origin navigation of the popup (its first counted document)
  const n = navigate(pop, "https://alpha.test/popped");
  assert.equal(n.ch.ua(), a2.page.nav.userAgent, "popup document load UA");
  same(n.page, a2.page, "popup after same-origin navigation");
  assert.equal(request(n.wg, "https://alpha.test/x").ua(), a2.page.nav.userAgent);
});

test("0051r2 popup: window.open(same-origin URL) inherits; a native opener gives a native popup", () => {
  fresh(ARMED);
  const t1 = newTab();
  const a1 = navigate(t1, "https://alpha.test/");
  const native = navigate(openPopup(t1), "https://alpha.test/?pop");
  assert.equal(a1.page.nav.userAgent, NATIVE_UA, "opener first document native");
  assert.equal(native.ch.ua(), NATIVE_UA, "popup of a native opener is native");
  assert.equal(native.page.nav.userAgent, NATIVE_UA);
  const a2 = navigate(t1, "https://alpha.test/2");
  const pop = openPopup(t1);
  const u = navigate(pop, "https://alpha.test/?pop2");
  assert.equal(u.ch.ua(), a2.page.nav.userAgent, "URL popup document load UA");
  same(u.page, a2.page, "URL popup navigator");
  // the popup's own second navigation follows the normal per-tab rule (armed)
  const u2 = navigate(pop, "https://alpha.test/next");
  assert.equal(u2.page.nav.userAgent, u2.ch.ua());
  assert.notEqual(u2.ch.ua(), NATIVE_UA);
});

test("0051r2 popup: cross-site popup keeps the opener's armed bit with its own site persona", () => {
  fresh(ARMED);
  const t1 = newTab();
  navigate(t1, "https://alpha.test/");
  navigate(t1, "https://alpha.test/2");
  const x = navigate(openPopup(t1), "https://gamma.test/");
  assert.notEqual(x.ch.ua(), NATIVE_UA, "armed like the opener");
  assert.equal(x.page.nav.userAgent, x.ch.ua(), "navigator == HTTP");
  const t3 = newTab();
  navigate(t3, "https://gamma.test/");
  const g2 = navigate(t3, "https://gamma.test/2");
  same(x.page, g2.page, "gamma's own per-site persona");
});

test("0051r2 popup: noopener popups use the site's live armed decision (0049 shared-worker rule)", () => {
  fresh(ARMED);
  const t1 = newTab();
  navigate(t1, "https://alpha.test/");
  const a2 = navigate(t1, "https://alpha.test/2");
  const t2 = newTab();
  const g1 = navigate(t2, "https://gamma.test/");
  liveTabs(t1, t2);
  const nA = navigate(openPopup(t1, { noopener: true }), "https://alpha.test/?np");
  assert.equal(nA.ch.ua(), a2.page.nav.userAgent, "live armed alpha tab → armed, same persona");
  same(nA.page, a2.page, "noopener alpha popup");
  const nG = navigate(openPopup(t1, { noopener: true }), "https://gamma.test/?np");
  assert.equal(g1.page.nav.userAgent, NATIVE_UA);
  assert.equal(nG.ch.ua(), NATIVE_UA, "live gamma tab is native → native");
  const nZ = navigate(openPopup(t1, { noopener: true }), "https://zeta.test/?np");
  assert.equal(nZ.ch.ua(), NATIVE_UA, "no live document of the site + strictFirstDoc → native");
  liveTabs();
});

test("0051r2 popup: user-initiated new tabs keep strictFirstDoc (no opener, no crossGroupOpener)", () => {
  fresh(ARMED);
  const t1 = newTab();
  navigate(t1, "https://alpha.test/");
  navigate(t1, "https://alpha.test/2");
  liveTabs(t1);
  const t2 = newTab(); // URL bar / bookmark / GUI new tab
  const d = navigate(t2, "https://alpha.test/");
  assert.equal(d.ch.ua(), NATIVE_UA, "first document of a user-opened tab stays native");
  assert.equal(d.page.nav.userAgent, NATIVE_UA);
  liveTabs();
});

test("0052: no persona diagnostic reaches prefs while darkstr.debug.diagPrefs is off", async () => {
  const { DARKSTR_DIAG_PREFS } = await import(pathToFileURL(shipped("DarkstrModeXor.sys.mjs")));
  const leaked = writes.filter((k) => DARKSTR_DIAG_PREFS.includes(k));
  assert.deepEqual([...new Set(leaked)], [], "diag prefs written during this file's flows");
  for (const k of DARKSTR_DIAG_PREFS) {
    assert.equal(prefs.has(k), false, k);
  }
  assert.ok(Object.keys(P.getDiagnostics()).length > 0, "diagnostics still recorded in memory");
});
