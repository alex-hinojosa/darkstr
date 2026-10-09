/**
 * 0048: cookie firewall correctness — behavioural tests against the shipped
 * modules (patches/0048-files), with minimal XPCOM stubs.
 *
 * Covers Rowan QA B1 (cross-site iframe read), B2 (HttpOnly / attributes),
 * credentials 'omit', third-party partitioning by top site, N1 (re-hook per
 * document on reload / same-site navigation) and mirror staleness.
 *
 * The child actor under test is the shipped one: patches/0051-files when
 * present (0051 N4: prototype-level, native-shaped hooks), else 0048-files.
 * The parent module is the shipped one too: patches/0052-files when present
 * (0052: diagnostics in memory unless darkstr.debug.diagPrefs), else 0048.
 *
 * 0048r2 (Proof FAILED f3f1e748): F1 response ordering (suspend until the
 * content cache acked), F2 A-B-A / cross-site no-cors fetch (Gecko TCP +
 * foreign-ancestor bit), F3 native gate (pref on the default branch, child
 * gate answers, C++ patch shape, firewall never calls the native store) and
 * check 4 (unpartitioned third-party cookies rejected like stock).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = join(root, "patches/0048-files");
const CHILD_FILES = existsSync(join(root, "patches/0051-files/DarkstrCookieFirewallChild.sys.mjs"))
  ? join(root, "patches/0051-files")
  : FILES;
const FW_FILE =
  ["0060-files", "0058b-files", "0058fp-files", "0058-files", "0057c-files", "0057-files", "0056-files", "0055-files", "0053r2-files", "0053-files", "0052-files"]
    .map((d) => join(root, "patches", d, "DarkstrCookieFirewall.sys.mjs"))
    .find((f) => existsSync(f)) || join(FILES, "DarkstrCookieFirewall.sys.mjs");
const FW_URL = "moz-src:///browser/components/DarkstrCookieFirewall.sys.mjs";

// ---------------------------------------------------------------- stubs ---
const prefs = new Map();
const defaultPrefs = new Map();
function resetPrefs(extra = {}) {
  prefs.clear();
  for (const [k, v] of Object.entries({
    "darkstr.mode": "pollution",
    "darkstr.nativeCompatible": false,
    "darkstr.nativePersonaHooks": true,
    "darkstr.cookieFirewall.enabled": true,
    "darkstr.cookieFirewall.mode": "isolate",
    "darkstr.cookieFirewall.allowlist": "",
    "darkstr.persona.seed": 42,
    "network.cookie.sameSite.laxByDefault": false,
    "network.cookie.sameSite.noneRequiresSecure": true,
    // LibreWolf default (librewolf.cfg): stock rejects unpartitioned 3P cookies.
    "network.cookie.cookieBehavior.optInPartitioning": true,
    ...extra,
  })) {
    prefs.set(k, v);
  }
}
const getP = (k, d) => (prefs.has(k) ? prefs.get(k) : d);
const MULTI = new Set(["co.uk"]);
function eTLDBase(host) {
  if (!host.includes(".")) {
    const e = new Error("NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS");
    throw e;
  }
  const labels = host.split(".");
  const two = labels.slice(-2).join(".");
  if (MULTI.has(two)) {
    if (labels.length < 3) {
      throw new Error("NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS");
    }
    return labels.slice(-3).join(".");
  }
  return two;
}
const sent = [];
const observers = {};
globalThis.Services = {
  // 0055: personas derive their Firefox version from the engine.
  appinfo: { version: "156.0.1", name: "LibreWolf" },
  prefs: {
    getBoolPref: getP,
    getStringPref: getP,
    getIntPref: getP,
    setBoolPref: (k, v) => prefs.set(k, v),
    setStringPref: (k, v) => prefs.set(k, v),
    setIntPref: (k, v) => prefs.set(k, v),
    addObserver() {},
    removeObserver() {},
    prefHasUserValue: (k) => prefs.has(k),
    clearUserPref: (k) => prefs.delete(k),
    getDefaultBranch: () => ({
      setBoolPref: (k, v) => defaultPrefs.set(k, v),
      getBoolPref: (k, d) => (defaultPrefs.has(k) ? defaultPrefs.get(k) : d),
    }),
  },
  eTLD: {
    getBaseDomainFromHost: eTLDBase,
    getPublicSuffixFromHost(h) {
      const labels = h.split(".");
      const two = labels.slice(-2).join(".");
      return MULTI.has(two) ? two : labels[labels.length - 1];
    },
  },
  obs: {
    addObserver(o, topic) {
      (observers[topic] ||= []).push(o);
    },
    removeObserver() {},
  },
  ppmm: { addMessageListener() {}, removeMessageListener() {} },
  wm: { getEnumerator: () => [] },
  cpmm: { sendSyncMessage: () => [] },
};
globalThis.Ci = {
  nsIHttpChannel: {},
  nsIWritablePropertyBag2: {},
  nsIContentPolicy: { TYPE_DOCUMENT: 6, TYPE_SUBDOCUMENT: 7, TYPE_FETCH: 20 },
  nsIRequest: { LOAD_ANONYMOUS: 1 << 14 },
};
globalThis.Cu = {
  waiveXrays: (x) => x,
  unwaiveXrays: (x) => x,
  exportFunction: (f) => f,
  cloneInto: (v) => v,
};
const registry = {};
globalThis.ChromeUtils = {
  importESModule(url) {
    if (registry[url]) {
      return registry[url];
    }
    throw new Error("no module " + url);
  },
  defineESModuleGetters(obj, map) {
    for (const [k, url] of Object.entries(map)) {
      Object.defineProperty(obj, k, { get: () => registry[url][k] });
    }
  },
  registerWindowActor() {},
  unregisterWindowActor() {},
};
globalThis.JSWindowActorChild = class {
  sendAsyncMessage(name, data) {
    sent.push({ name, data, from: this });
  }
};
globalThis.JSWindowActorParent = class {};
const wgById = new Map();
globalThis.WindowGlobalParent = { getByInnerWindowId: (id) => wgById.get(id) || null };

const fwMod = await import(pathToFileURL(FW_FILE));
registry[FW_URL] = fwMod;
const childMod = await import(
  pathToFileURL(join(CHILD_FILES, "DarkstrCookieFirewallChild.sys.mjs"))
);
const { DarkstrCookieFirewall: FW, DarkstrCookieCore: Core } = fwMod;

// ------------------------------------------------------- fake Gecko DOM ---
function uri(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  return {
    spec: url,
    scheme: u.protocol.slice(0, -1),
    host,
    asciiHost: host,
    pathQueryRef: u.pathname + u.search,
    schemeIs: (s) => u.protocol === s + ":",
  };
}
function principal(url, oa = {}) {
  const U = uri(url);
  return {
    isContentPrincipal: true,
    isSystemPrincipal: false,
    URI: U,
    originAttributes: { userContextId: 0, privateBrowsingId: 0, ...oa },
    schemeIs: U.schemeIs,
  };
}
let nextId = 1;
class FakeParentActor {
  constructor(wg) {
    this.manager = wg;
    this.msgs = [];
  }
  sendAsyncMessage(name, data) {
    this.msgs.push({ name, data });
    if (this.onMessage) {
      this.onMessage({ name, data });
    }
  }
  sendQuery(name, data) {
    this.msgs.push({ name, data, query: true });
    if (this.onQuery) {
      return this.onQuery({ name, data });
    }
    if (this.onMessage) {
      return Promise.resolve(this.onMessage({ name, data }));
    }
    return Promise.resolve(null);
  }
}
/** Browsing context tree: tab(url) → frame(parentBC, url). */
function tab(url, oa) {
  const bc = { parent: null };
  bc.top = bc;
  load(bc, url, oa);
  return bc;
}
function frame(parentBC, url, oa) {
  const bc = { parent: parentBC, top: parentBC.top };
  load(bc, url, oa);
  return bc;
}
function load(bc, url, oa) {
  const wg = {
    innerWindowId: nextId++,
    documentPrincipal: principal(url, oa),
    documentURI: uri(url),
    browsingContext: bc,
    osPid: 4242,
    isInProcess: false,
  };
  const actor = new FakeParentActor(wg);
  wg.getActor = () => actor;
  wg.actor = actor;
  bc.currentWindowGlobal = wg;
  wgById.set(wg.innerWindowId, wg);
  return wg;
}
function channel(url, { bc = null, type = 20, method = "GET", anonymous = false, setCookie = null, triggering = null, oa, loading, partitionKey = "" } = {}) {
  const reqHeaders = new Map();
  const resHeaders = new Map();
  if (setCookie) {
    resHeaders.set("Set-Cookie", [].concat(setCookie).join("\n"));
  }
  return {
    URI: uri(url),
    loadFlags: anonymous ? Ci.nsIRequest.LOAD_ANONYMOUS : 0,
    requestMethod: method,
    loadInfo: {
      externalContentPolicyType: type,
      browsingContext: bc,
      triggeringPrincipal: triggering || (type === 6 ? null : bc?.currentWindowGlobal?.documentPrincipal || null),
      loadingPrincipal: loading !== undefined ? loading : bc?.currentWindowGlobal?.documentPrincipal || null,
      originAttributes: { userContextId: 0, privateBrowsingId: 0, ...(oa || {}) },
      cookieJarSettings: { partitionKey },
    },
    suspendCount: 0,
    suspend() {
      this.suspendCount++;
    },
    resume() {
      this.suspendCount--;
      this.onResume?.();
    },
    QueryInterface() {
      return this;
    },
    setRequestHeader: (k, v) => reqHeaders.set(k, v),
    getRequestHeader: (k) => {
      if (!reqHeaders.has(k)) {
        throw new Error("NS_ERROR_NOT_AVAILABLE");
      }
      return reqHeaders.get(k);
    },
    getResponseHeader: (k) => {
      if (!resHeaders.has(k)) {
        throw new Error("NS_ERROR_NOT_AVAILABLE");
      }
      return resHeaders.get(k);
    },
    setResponseHeader: (k, v) => resHeaders.set(k, v),
    reqHeaders,
    resHeaders,
  };
}
/** Run one request through the firewall; returns the Cookie header sent (or null). */
function fetchVia(url, opts = {}) {
  const ch = channel(url, opts);
  FW._onHttp(ch, "http-on-modify-request");
  if (opts.setCookie) {
    FW._onHttp(ch, "http-on-examine-response");
  }
  return { cookie: ch.reqHeaders.has("Cookie") ? ch.reqHeaders.get("Cookie") : null, ch };
}
const docCookie = (bc) => FW.getDocumentCookie(bc.currentWindowGlobal).cookie;

function fresh(extraPrefs) {
  resetPrefs(extraPrefs);
  FW.uninit();
  FW.init();
  childMod._processCacheForTest().clear();
  sent.length = 0;
}

// ---------------------------------------------------------------- tests ---
test("default prefs: firewall idle, no header or script mutation", () => {
  fresh({
    "darkstr.mode": "homogeneous",
    "darkstr.nativePersonaHooks": false,
    "darkstr.cookieFirewall.enabled": false,
    "darkstr.cookieFirewall.mode": "synthetic",
  });
  assert.equal(FW.getPlan().armed, false);
  const t = tab("http://a.test/");
  const r = fetchVia("http://a.test/x", { bc: t, setCookie: "sid=1" });
  assert.equal(r.cookie, null, "no Cookie header written when idle");
  assert.equal(r.ch.resHeaders.get("Set-Cookie"), "sid=1", "Set-Cookie untouched");
  assert.equal(FW.installForWindowGlobal(t.currentWindowGlobal).decision, "passthrough");
});

for (const mode of ["isolate", "synthetic"]) {
  test(`[${mode}] B1: cross-site iframe sees its own cookies, not the top site's`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    const top = tab("https://a.test/");
    fetchVia("https://a.test/", { bc: top, type: 6, setCookie: "top_sid=TOP; Path=/" });
    const ifr = frame(top, "https://b.test/frame");
    // iframe gets its own (third-party, CHIPS-partitioned) cookie via HTTP;
    // an unpartitioned one is rejected like stock (check 4).
    fetchVia("https://b.test/set", {
      bc: ifr,
      setCookie: ["b_sid=B; Path=/; Secure; SameSite=None; Partitioned", "b_plain=X; Path=/"],
    });
    const childView = docCookie(ifr);
    assert.doesNotMatch(childView, /top_sid/, "top-site cookie must not leak into cross-site iframe");
    assert.doesNotMatch(childView, /b_plain/, "unpartitioned third-party cookie rejected (stock)");
    assert.match(childView, /^b_sid=/);
    const http = fetchVia("https://b.test/echo", { bc: ifr }).cookie;
    assert.equal(http, childView, "iframe document.cookie == iframe HTTP Cookie (no split-brain)");
    assert.match(docCookie(top), /^top_sid=/);
    assert.doesNotMatch(docCookie(top), /b_sid/);
    assert.equal(FW.documentContext(ifr.currentWindowGlobal).kind, "3p");
    if (mode === "synthetic") {
      assert.doesNotMatch(childView, /=B$/, "synthetic rewrites value");
    } else {
      assert.equal(childView, "b_sid=B");
    }
  });

  test(`[${mode}] B2: HttpOnly hidden from script, attributes honoured`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    const t = tab("http://a.test/app/page");
    fetchVia("http://a.test/app/set", {
      bc: t,
      setCookie: [
        "h=SECRET; HttpOnly; Path=/",
        "p=1; Path=/app",
        "q=1; Path=/other",
        "s=1; Secure; Path=/",
        "dead=1; Max-Age=0",
      ],
    });
    const view = docCookie(t);
    assert.doesNotMatch(view, /\bh=/, "HttpOnly not visible to document.cookie");
    assert.match(view, /\bp=/, "path-matching cookie visible");
    assert.doesNotMatch(view, /\bq=/, "non-matching path hidden");
    assert.doesNotMatch(view, /\bs=/, "Secure cookie not set from http origin");
    assert.doesNotMatch(view, /\bdead=/);
    const http = fetchVia("http://a.test/app/x", { bc: t }).cookie;
    assert.match(http, /\bh=/, "HttpOnly still sent over HTTP");
    // Script cannot overwrite or create HttpOnly cookies.
    FW.setDocumentCookie(t.currentWindowGlobal, "h=EVIL; Path=/");
    FW.setDocumentCookie(t.currentWindowGlobal, "h2=EVIL; HttpOnly");
    const after = fetchVia("http://a.test/app/x", { bc: t }).cookie;
    assert.doesNotMatch(after, /EVIL/);
    assert.doesNotMatch(after, /\bh2=/);
    // The child snapshot carries HttpOnly only as a value-less stub.
    const snap = FW.installForWindowGlobal(t.currentWindowGlobal).records;
    const stub = snap.find((r) => r.name === "h");
    assert.ok(stub?.stub && stub.value === "", "HttpOnly value never sent to content");
  });

  test(`[${mode}] credentials 'omit' (LOAD_ANONYMOUS) gets no Cookie and stores nothing`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    const t = tab("http://a.test/");
    fetchVia("http://a.test/set", { bc: t, setCookie: "sid=1" });
    const omit = fetchVia("http://a.test/echo", { bc: t, anonymous: true });
    assert.equal(omit.cookie, null, "no Cookie header on anonymous request");
    const r = fetchVia("http://a.test/set2", { bc: t, anonymous: true, setCookie: "late=1" });
    assert.equal(r.ch.resHeaders.get("Set-Cookie"), "", "Set-Cookie stripped from primary jar");
    assert.doesNotMatch(fetchVia("http://a.test/echo", { bc: t }).cookie, /late=/);
  });

  test(`[${mode}] third-party cookies are partitioned by top-level site`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    const UID = "uid=TRACK; Secure; SameSite=None; Partitioned";
    const a = tab("https://a.test/");
    const trackerInA = frame(a, "https://tracker.test/f");
    fetchVia("https://tracker.test/set", { bc: trackerInA, setCookie: UID });
    assert.match(fetchVia("https://tracker.test/px", { bc: trackerInA }).cookie, /^uid=/);
    // A third-party request from the first-party page shares the partition.
    assert.match(fetchVia("https://tracker.test/px", { bc: a }).cookie, /^uid=/);
    const c = tab("https://c.test/");
    const trackerInC = frame(c, "https://tracker.test/f");
    assert.equal(fetchVia("https://tracker.test/px", { bc: trackerInC }).cookie, "", "no cross-site tracking");
    assert.equal(docCookie(trackerInC), "");
    // The tracker as a first party is a different partition again.
    const t1 = tab("https://tracker.test/");
    assert.equal(fetchVia("https://tracker.test/", { bc: t1, type: 6 }).cookie, "");
    if (mode === "synthetic") {
      fetchVia("https://tracker.test/set", { bc: trackerInC, setCookie: UID });
      const va = docCookie(trackerInA);
      const vc = docCookie(trackerInC);
      assert.notEqual(va, vc, "synthetic tokens differ per partition");
    }
  });

  test(`[${mode}] golden lock (global seed): first-party tokens still differ per site`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode, "darkstr.persona.rotatePerSite": false });
    const a = tab("http://a.test/");
    const b = tab("http://b.test/");
    fetchVia("http://a.test/", { bc: a, type: 6, setCookie: "_ga=GA1.1.123" });
    fetchVia("http://b.test/", { bc: b, type: 6, setCookie: "_ga=GA1.1.123" });
    if (mode === "synthetic") {
      assert.notEqual(docCookie(a), docCookie(b), "no cross-site linkable token");
    } else {
      assert.equal(docCookie(a), docCookie(b), "isolate keeps server values");
    }
  });

  test(`[${mode}] synthetic/isolate value identical on HTTP and script paths`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    const t = tab("http://a.test/");
    FW.setDocumentCookie(t.currentWindowGlobal, "js=VALUE; Path=/");
    fetchVia("http://a.test/set", { bc: t, setCookie: "srv=SRV; Path=/" });
    assert.equal(fetchVia("http://a.test/echo", { bc: t }).cookie, docCookie(t));
  });
}

test("SameSite: enforced against initiator + context chain; Lax only on top-level GET", () => {
  fresh();
  const a = tab("https://a.test/");
  fetchVia("https://a.test/", {
    bc: a,
    type: 6,
    setCookie: ["st=1; SameSite=Strict", "lx=1; SameSite=Lax", "no=1"],
  });
  const own = fetchVia("https://a.test/api", { bc: a }).cookie;
  for (const n of ["st=1", "lx=1", "no=1"]) {
    assert.ok(own.includes(n), `first-party request carries ${n}`);
  }
  const c = tab("https://c.test/");
  const embedded = fetchVia("https://a.test/img", { bc: c }).cookie;
  assert.equal(embedded, "", "different partition entirely");
  // Same top, cross-site context (A-B-A request): no top-level-site cookies at
  // all, not even SameSite=None ones (Gecko TCP; Proof F2).
  const cf = frame(a, "https://c.test/f");
  assert.equal(fetchVia("https://a.test/api", { bc: cf }).cookie, "");
  // First-party document, cross-site initiator (e.g. injected by c.test):
  // SameSite cookies withheld, None sent.
  const injected = fetchVia("https://a.test/api", {
    bc: a,
    triggering: principal("https://c.test/"),
  }).cookie;
  assert.doesNotMatch(injected, /st=|lx=/);
  assert.match(injected, /no=1/);
  // Partitioned cookies inside the cross-site frame obey SameSite too.
  fetchVia("https://c.test/set", {
    bc: cf,
    setCookie: ["pn=1; SameSite=None; Secure; Partitioned", "pl=1; SameSite=Lax; Secure; Partitioned"],
  });
  const inFrame = fetchVia("https://c.test/x", { bc: cf }).cookie;
  assert.match(inFrame, /pn=1/);
  assert.doesNotMatch(inFrame, /pl=1/, "Lax cookie not set from a cross-site context");
  const nav = fetchVia("https://a.test/", {
    bc: a,
    type: 6,
    triggering: principal("https://c.test/"),
  }).cookie;
  assert.match(nav, /lx=1/);
  assert.doesNotMatch(nav, /st=1/);
  const post = fetchVia("https://a.test/", {
    bc: a,
    type: 6,
    method: "POST",
    triggering: principal("https://c.test/"),
  }).cookie;
  assert.doesNotMatch(post, /lx=1|st=1/, "cross-site POST navigation: no Lax");
  assert.match(post, /no=1/);
});

test("Domain attribute: subdomain sharing, public suffix rejected", () => {
  fresh();
  const t = tab("http://www.a.co.uk/");
  fetchVia("http://www.a.co.uk/", {
    bc: t,
    type: 6,
    setCookie: ["d=1; Domain=a.co.uk", "bad=1; Domain=co.uk", "host=1"],
  });
  const sub = fetchVia("http://shop.a.co.uk/", { bc: t }).cookie;
  assert.match(sub, /d=1/);
  assert.doesNotMatch(sub, /bad=|host=/);
});

test("allowlisted top site is passthrough on both paths", () => {
  fresh({ "darkstr.cookieFirewall.allowlist": "a.test" });
  const t = tab("http://a.test/");
  const r = fetchVia("http://a.test/", { bc: t, type: 6, setCookie: "sid=1" });
  assert.equal(r.cookie, null);
  assert.equal(r.ch.resHeaders.get("Set-Cookie"), "sid=1");
  assert.equal(FW.installForWindowGlobal(t.currentWindowGlobal).decision, "passthrough");
});

test("private browsing jars are separate and dropped on last-pb-context-exited", () => {
  fresh();
  const pb = tab("http://a.test/", { privateBrowsingId: 1 });
  fetchVia("http://a.test/", { bc: pb, type: 6, setCookie: "pb=1", oa: { privateBrowsingId: 1 } });
  const normal = tab("http://a.test/");
  assert.equal(fetchVia("http://a.test/", { bc: normal, type: 6 }).cookie, "");
  FW._dropPrivateJars();
  assert.equal(fetchVia("http://a.test/", { bc: pb, type: 6, oa: { privateBrowsingId: 1 } }).cookie, "");
});

// ---------------------------------------------------------- child actor ---
function childActorFor(wg, document, window) {
  const actor = new childMod.DarkstrCookieFirewallChild();
  actor.manager = { innerWindowId: wg.innerWindowId };
  actor.document = document;
  actor.contentWindow = window;
  return actor;
}
function wireSync() {
  // Sync install goes straight to the parent module, as ppmm would.
  Services.cpmm.sendSyncMessage = (name, data) => [
    FW._onSyncInstall({ name, data, target: { osPid: 4242 } }),
  ];
  // Child → parent writes and parent → child deltas.
  const origSend = globalThis.JSWindowActorChild.prototype.sendAsyncMessage;
  return origSend;
}
// Native-shaped DOM: `cookie` accessor on Document.prototype (HTMLDocument
// inherits it), CookieStore methods on CookieStore.prototype. The native
// members are the "real jar" — the firewall must never reach them.
const nativeJar = new WeakMap();
const nativeCalls = [];
const DocumentProto = {};
{
  const acc = {
    get cookie() {
      if (!nativeJar.has(this)) throw new TypeError("'get cookie' called on an object that does not implement interface Document.");
      nativeCalls.push("get cookie");
      return nativeJar.get(this);
    },
    set cookie(v) {
      if (!nativeJar.has(this)) throw new TypeError("'set cookie' called on an object that does not implement interface Document.");
      nativeCalls.push("set cookie");
      nativeJar.set(this, String(v));
    },
  };
  const d = Object.getOwnPropertyDescriptor(acc, "cookie");
  Object.defineProperty(DocumentProto, "cookie", { get: d.get, set: d.set, enumerable: true, configurable: true });
}
const HTMLDocumentProto = Object.create(DocumentProto);
const CookieStoreProto = {};
{
  const natives = {
    get() { nativeCalls.push("store.get"); return Promise.resolve(null); },
    getAll() { nativeCalls.push("store.getAll"); return Promise.resolve([]); },
    set(_nameOrOptions) { nativeCalls.push("store.set"); return Promise.resolve(); },
    delete(_nameOrOptions) { nativeCalls.push("store.delete"); return Promise.resolve(); },
  };
  for (const [k, v] of Object.entries(natives)) {
    Object.defineProperty(CookieStoreProto, k, { value: v, writable: true, enumerable: true, configurable: true });
  }
}
const NATIVE_COOKIE = Object.getOwnPropertyDescriptor(DocumentProto, "cookie");
const NATIVE_STORE = Object.getOwnPropertyDescriptors(CookieStoreProto);
function fakeDoc(url) {
  const doc = Object.create(HTMLDocumentProto);
  Object.defineProperty(doc, "nodePrincipal", { value: principal(url) });
  nativeJar.set(doc, "");
  return doc;
}
function fakeWindow() {
  return {
    Promise,
    cookieStore: Object.create(CookieStoreProto),
  };
}
const hooked = (doc) => !!childMod.installRecordFor(doc);

test("N1: reload / same-site navigation in the same tab re-hooks document.cookie", () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/?n=1");
  const win = fakeWindow(); // same WindowProxy across navigations
  const doc1 = fakeDoc("http://a.test/?n=1");
  childActorFor(t.currentWindowGlobal, doc1, win).handleEvent({ type: "DOMWindowCreated" });
  assert.ok(hooked(doc1), "first document hooked");
  assert.equal(Object.hasOwn(doc1, "cookie"), false, "no own property");
  for (const url of ["http://a.test/?n=2", "http://a.test/?n=2" /* reload */]) {
    const wg = load(t, url);
    const doc = fakeDoc(url);
    childActorFor(wg, doc, win).handleEvent({ type: "DOMWindowCreated" });
    assert.ok(hooked(doc), `document after navigation to ${url} is hooked`);
    assert.equal(Object.hasOwn(doc, "cookie"), false);
    assert.equal(childMod.installRecordFor(doc)?.ctx.decision, "sandbox");
  }
});

test("0051 N4: cookie hooks are prototype-level and native-shaped (no own props, no brand)", async () => {
  fresh();
  wireSync();
  const t = tab("https://a.test/");
  const doc = fakeDoc("https://a.test/");
  const win = fakeWindow();
  childActorFor(t.currentWindowGlobal, doc, win).handleEvent({ type: "DOMWindowCreated" });
  assert.ok(hooked(doc));
  assert.deepEqual(Object.getOwnPropertyNames(doc), ["nodePrincipal"], "no own cookie property");
  assert.deepEqual(Object.getOwnPropertyNames(win.cookieStore), [], "no own cookieStore methods");
  const d = Object.getOwnPropertyDescriptor(DocumentProto, "cookie");
  assert.notEqual(d.get, NATIVE_COOKIE.get, "hook lives on Document.prototype");
  assert.equal(Object.getOwnPropertyDescriptor(HTMLDocumentProto, "cookie"), undefined);
  assert.equal(d.get.name, "get cookie");
  assert.equal(d.set.name, "set cookie");
  assert.equal(d.get.length, 0);
  assert.equal(d.set.length, 1);
  assert.equal(d.enumerable, NATIVE_COOKIE.enumerable);
  assert.equal(d.configurable, NATIVE_COOKIE.configurable);
  for (const m of ["get", "getAll", "set", "delete"]) {
    const sd = Object.getOwnPropertyDescriptor(CookieStoreProto, m);
    assert.notEqual(sd.value, NATIVE_STORE[m].value, `${m} hooked on CookieStore.prototype`);
    assert.equal(sd.value.name, m);
    assert.doesNotMatch(sd.value.name, /darkstr/i);
    assert.equal(sd.value.length, NATIVE_STORE[m].value.length, `${m}.length native`);
    assert.equal(sd.writable, true);
    assert.equal(sd.enumerable, true);
  }
  // The sandbox answers for this document; the real jar is never touched.
  nativeCalls.length = 0;
  doc.cookie = "proto=1; Path=/";
  assert.match(doc.cookie, /proto=1/);
  assert.deepEqual((await win.cookieStore.getAll()).map((c) => c.name), ["proto"]);
  assert.deepEqual(nativeCalls, []);
  // A receiver that is not a hooked document goes to the native member.
  assert.throws(() => d.get.call({}), TypeError);
  const other = fakeDoc("https://b.test/");
  other.cookie = "native=1";
  assert.equal(other.cookie, "native=1");
  assert.deepEqual(nativeCalls, ["set cookie", "get cookie"]);
  await Object.create(CookieStoreProto).get("x");
  assert.ok(nativeCalls.includes("store.get"));
  // Uninstall restores the native members once no document uses them.
  childMod.uninstallCookieHooks(doc);
});

test("mirror staleness: same-process documents share writes; HTTP Set-Cookie pushed live", () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/");
  const win = fakeWindow();
  const top = fakeDoc("http://a.test/");
  const topActor = childActorFor(t.currentWindowGlobal, top, win);
  topActor.handleEvent({ type: "DOMWindowCreated" });
  const ifr = frame(t, "http://a.test/peer");
  const peer = fakeDoc("http://a.test/peer");
  const peerActor = childActorFor(ifr.currentWindowGlobal, peer, fakeWindow());
  peerActor.handleEvent({ type: "DOMWindowCreated" });
  // Route parent → child deltas to the child actors (same process).
  for (const [wg, ca] of [[t.currentWindowGlobal, topActor], [ifr.currentWindowGlobal, peerActor]]) {
    wg.actor.onMessage = (m) => ca.receiveMessage(m);
  }
  top.cookie = "qa_late=1; Path=/";
  assert.match(peer.cookie, /qa_late=1/, "peer document sees the write synchronously");
  // child → parent write lands in the parent jar
  const w = sent.find((m) => m.name === "DarkstrCookieFirewall:SetDocumentCookie");
  FW.setDocumentCookie(t.currentWindowGlobal, w.data.raw);
  assert.match(fetchVia("http://a.test/echo", { bc: t }).cookie, /qa_late=1/);
  // HTTP Set-Cookie reaches already-loaded documents without a reload
  fetchVia("http://a.test/set", { bc: t, setCookie: "srv=2; Path=/" });
  assert.match(top.cookie, /srv=2/);
  assert.match(peer.cookie, /srv=2/);
  // HttpOnly from HTTP: invisible, and script cannot shadow it
  fetchVia("http://a.test/set", { bc: t, setCookie: "ho=1; HttpOnly; Path=/" });
  top.cookie = "ho=EVIL; Path=/";
  assert.doesNotMatch(top.cookie, /ho=/);
});

test("child cookieStore reflects the sandbox and hides HttpOnly", async () => {
  fresh();
  wireSync();
  // cookieStore only exists in secure contexts.
  const t = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: t, type: 6, setCookie: ["v=1", "h=1; HttpOnly"] });
  const win = fakeWindow();
  const doc = fakeDoc("https://a.test/");
  childActorFor(t.currentWindowGlobal, doc, win).handleEvent({ type: "DOMWindowCreated" });
  const all = await win.cookieStore.getAll();
  assert.deepEqual(all.map((c) => c.name), ["v"]);
  await win.cookieStore.set("w", "2");
  assert.match(doc.cookie, /w=2/);
  await win.cookieStore.delete("w");
  assert.doesNotMatch(doc.cookie, /w=2/);
});

test("N1: initial about:blank reused for a same-origin document is re-hooked (DOMDocElementInserted)", () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/");
  const top = fakeDoc("http://a.test/");
  childActorFor(t.currentWindowGlobal, top, fakeWindow()).handleEvent({ type: "DOMWindowCreated" });
  // iframe: initial about:blank (inherits a.test), then same-origin /frame in the SAME inner window.
  const f = frame(t, "http://a.test/");
  f.currentWindowGlobal.documentURI = uri("about:blank"); // inherits a.test principal
  const win = fakeWindow();
  const blank = fakeDoc("http://a.test/"); // inherits a.test principal
  const actor = childActorFor(f.currentWindowGlobal, blank, win);
  actor.handleEvent({ type: "DOMWindowCreated" });
  assert.ok(hooked(blank), "about:blank hooked");
  let calls = 0;
  const sync = Services.cpmm.sendSyncMessage;
  Services.cpmm.sendSyncMessage = (...a) => (calls++, sync(...a));
  const framed = fakeDoc("http://a.test/frame");
  actor.document = framed; // same actor / innerWindowId, new document, no DOMWindowCreated
  f.currentWindowGlobal.documentURI = uri("http://a.test/frame"); // WindowGlobalChild::OnNewDocument
  actor.handleEvent({ type: "DOMDocElementInserted" });
  assert.ok(hooked(framed), "reused-window document hooked");
  assert.equal(childMod.installRecordFor(framed)?.ctx.decision, "sandbox");
  actor.handleEvent({ type: "DOMDocElementInserted" });
  assert.equal(calls, 1, "one sync policy fetch per document");
  Services.cpmm.sendSyncMessage = sync;
});

test("non-http(s) principal documents are never hooked and cause no IPC", () => {
  fresh();
  let calls = 0;
  Services.cpmm.sendSyncMessage = () => {
    calls++;
    return [];
  };
  const doc = { nodePrincipal: { isContentPrincipal: false, schemeIs: () => false } };
  const actor = new childMod.DarkstrCookieFirewallChild();
  actor.manager = { innerWindowId: 999 };
  actor.document = doc;
  actor.contentWindow = fakeWindow();
  actor.handleEvent({ type: "DOMWindowCreated" });
  assert.equal(calls, 0);
  assert.equal(Object.getOwnPropertyDescriptor(doc, "cookie"), undefined);
  assert.equal(hooked(doc), false);
});

test("module header claim (line 29) is backed: strip + hook-every-document + residual named", () => {
  const src = readFileSync(FW_FILE, "utf8");
  assert.match(src, /kept out of the primary profile jar/);
  assert.match(src, /before SetCookieHeaders/);
  assert.match(src, /ServiceWorkerGlobalScope\.cookieStore/);
  assert.doesNotMatch(src, /matches: \["\*:\/\/\*\/\*"\]/, "actor must also cover about:blank/srcdoc");
});

// ======================================================= 0048r2 (Proof) ===
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 5000) {
  const dl = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > dl) {
      throw new Error("waitFor timeout");
    }
    await tick(5);
  }
}
const GATE = "darkstr.cookieFirewall.contentGate";
/** Child document wired to the parent like a real content process. */
function liveDoc(bc, url, { lagMs = 0 } = {}) {
  const doc = fakeDoc(url);
  const win = fakeWindow();
  const actor = childActorFor(bc.currentWindowGlobal, doc, win);
  actor.handleEvent({ type: "DOMWindowCreated" });
  const pa = bc.currentWindowGlobal.actor;
  pa.onMessage = (m) => actor.receiveMessage(m);
  // Deltas race the HTTP response: delivered `lagMs` later, like an IPC
  // message on a different channel than the response.
  pa.onQuery = (m) =>
    new Promise((res) => setTimeout(() => res(actor.receiveMessage(m)), lagMs));
  return { doc, win, actor, wg: bc.currentWindowGlobal };
}

// ---- F1 -------------------------------------------------------------------
for (const mode of ["isolate", "synthetic"]) {
  test(`[${mode}] F1: fetch Set-Cookie is in document.cookie before the response is released`, async () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    wireSync();
    const t = tab("http://127.0.0.1/");
    const { doc } = liveDoc(t, "http://127.0.0.1/", { lagMs: 40 });
    const ch = channel("http://127.0.0.1/set", {
      bc: t,
      setCookie: ["f1_unset=U; Path=/", "f1_lax=L; SameSite=Lax; Path=/", "f1_strict=S; SameSite=Strict; Path=/"],
    });
    let atResume = null;
    ch.onResume = () => {
      atResume = doc.cookie;
    };
    FW._onHttp(ch, "http-on-modify-request");
    FW._onHttp(ch, "http-on-examine-response");
    assert.equal(ch.suspendCount, 1, "response held while the delta is in flight");
    assert.doesNotMatch(doc.cookie, /f1_/, "delta not applied yet (the race Proof hit)");
    await waitFor(() => atResume !== null);
    assert.equal(ch.suspendCount, 0, "resumed exactly once");
    for (const n of ["f1_unset=", "f1_lax=", "f1_strict="]) {
      assert.ok(atResume.includes(n), `${n} visible when the response is released`);
    }
    assert.equal(FW._ackStats.timeouts, 0);
  });
}

test("F1: requester whose actor missed the live set is still acked (install race)", async () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/");
  const { doc, wg } = liveDoc(t, "http://a.test/", { lagMs: 10 });
  FW._liveActors.delete(wg.actor);
  delete wg.actor._darkstrCtx;
  const ch = channel("http://a.test/set", { bc: t, setCookie: "late=1; Path=/" });
  let atResume = null;
  ch.onResume = () => (atResume = doc.cookie);
  FW._onHttp(ch, "http-on-examine-response");
  assert.equal(ch.suspendCount, 1);
  await waitFor(() => atResume !== null);
  assert.match(atResume, /late=1/);
});

test("F1: a content process that never acks cannot stall the response (timeout)", async () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/");
  const { wg } = liveDoc(t, "http://a.test/");
  wg.actor.onQuery = () => new Promise(() => {});
  const ch = channel("http://a.test/set", { bc: t, setCookie: "x=1" });
  const t0 = Date.now();
  FW._onHttp(ch, "http-on-examine-response");
  await waitFor(() => ch.suspendCount === 0, 4000);
  const dt = Date.now() - t0;
  assert.ok(dt >= 1900 && dt < 3500, `released by the ${dt} ms timeout`);
  assert.equal(FW._ackStats.timeouts, 1);
});

test("F1: no hold when nothing changed, when idle, or for anonymous requests", () => {
  fresh();
  const t = tab("http://a.test/");
  const r1 = fetchVia("http://a.test/set", { bc: t, setCookie: "bad; Domain=example.com" });
  assert.equal(r1.ch.suspendCount, 0);
  const r2 = fetchVia("http://a.test/set", { bc: t, anonymous: true, setCookie: "x=1" });
  assert.equal(r2.ch.suspendCount, 0);
  fresh({ "darkstr.cookieFirewall.enabled": false });
  const r3 = fetchVia("http://a.test/set", { bc: tab("http://a.test/"), setCookie: "x=1" });
  assert.equal(r3.ch.suspendCount, 0);
  assert.equal(r3.ch.resHeaders.get("Set-Cookie"), "x=1");
});

// ---- F2 -------------------------------------------------------------------
for (const mode of ["isolate", "synthetic"]) {
  for (const middle of ["http://127.0.0.1/frame", "http://[::1]/frame"]) {
    test(`[${mode}] F2: A-B-A via ${middle} — no top cookies in the cross-site frame, its no-cors fetch, or the nested frame`, () => {
      fresh({ "darkstr.cookieFirewall.mode": mode });
      const top = tab("http://localhost/");
      fetchVia("http://localhost/", { bc: top, type: 6 });
      fetchVia("http://localhost/set", {
        bc: top,
        setCookie: [
          "qa_top_http=ORIG_TOP_HTTP; Path=/",
          "qa_top_ho=ORIG_TOP_HO; HttpOnly; Path=/",
          "qa_top_none=ORIG_NONE; SameSite=None; Secure; Path=/",
          "qa_top_lax=L; SameSite=Lax; Path=/",
        ],
      });
      FW.setDocumentCookie(top.currentWindowGlobal, "qa_marker=ORIG_TOP_JS; path=/; SameSite=Lax");
      assert.match(docCookie(top), /qa_top_http=.*qa_top_none=|qa_top_none=.*qa_top_http=/);
      const b = frame(top, middle);
      assert.equal(FW.documentContext(b.currentWindowGlobal).kind, "3p");
      // (a) credentialed no-cors fetch from the cross-site frame to the top site
      const aba = fetchVia("http://localhost/echo", { bc: b }).cookie;
      assert.equal(aba, "", "no top-level-site cookies (incl. HttpOnly) from a cross-site context");
      // (b) nested same-site frame: navigation request, document, its fetch
      const nav = fetchVia("http://localhost/frame", { bc: b, type: 7 }).cookie;
      assert.equal(nav, "", "nested frame navigation carries no top cookies");
      const nested = frame(b, "http://localhost/frame");
      const nctx = FW.documentContext(nested.currentWindowGlobal);
      assert.equal(nctx.kind, "3pf", "foreign-ancestor bit");
      assert.deepEqual(nctx.readKeys, [nctx.jarKey + "|pf"]);
      assert.equal(docCookie(nested), "");
      assert.equal(fetchVia("http://localhost/echo", { bc: nested }).cookie, "");
      // Cross-site frame writes without Partitioned are rejected; nothing
      // reaches the top site's jar from inside the A-B-A chain.
      FW.setDocumentCookie(b.currentWindowGlobal, "qa_child3p=CHILD; path=/");
      FW.setDocumentCookie(nested.currentWindowGlobal, "qa_nest=N; path=/");
      assert.equal(docCookie(b), "");
      assert.equal(docCookie(nested), "");
      assert.doesNotMatch(docCookie(top), /qa_child3p|qa_nest/);
      // A Partitioned cookie from the A-B-A frame lives in the pf partition only.
      FW.setDocumentCookie(nested.currentWindowGlobal, "qa_pf=PF; path=/; Secure; SameSite=None; Partitioned");
      assert.match(docCookie(nested), /^qa_pf=/);
      assert.doesNotMatch(docCookie(top), /qa_pf/);
      assert.equal(fetchVia("http://localhost/echo", { bc: b }).cookie, "");
      // Top site still has its own cookies.
      const topHttp = fetchVia("http://localhost/echo", { bc: top }).cookie;
      assert.match(topHttp, /qa_top_ho=/);
      assert.match(topHttp, /qa_marker=/);
    });
  }
}

test("F2: child process view of the A-B-A frame is empty (snapshot + hooks)", () => {
  fresh();
  wireSync();
  const top = tab("http://localhost/");
  fetchVia("http://localhost/set", { bc: top, setCookie: ["t1=1; Path=/", "t2=2; SameSite=None; Secure; Path=/"] });
  const b = frame(top, "http://127.0.0.1/frame");
  const nested = frame(b, "http://localhost/frame");
  const n = liveDoc(nested, "http://localhost/frame");
  assert.equal(n.doc.cookie, "");
  n.doc.cookie = "w=1; path=/";
  assert.equal(n.doc.cookie, "", "unpartitioned write rejected in the child too");
  const t = liveDoc(top, "http://localhost/");
  assert.match(t.doc.cookie, /t1=1/);
});

// ---- check 4 --------------------------------------------------------------
test("check 4: unpartitioned third-party cookies rejected (stock optInPartitioning); Partitioned needs Secure", () => {
  fresh();
  const a = tab("https://a.test/");
  const bf = frame(a, "https://b.test/f");
  fetchVia("https://b.test/set", {
    bc: bf,
    setCookie: ["qa_3p=TP; Path=/", "qa_3p_ins=X; Partitioned; Path=/", "qa_3p_ok=OK; Secure; SameSite=None; Partitioned; Path=/"],
  });
  FW.setDocumentCookie(bf.currentWindowGlobal, "qa_3p_doc=TPDOC; path=/");
  FW.setDocumentCookie(bf.currentWindowGlobal, "qa_3p_docp=P; path=/; Secure; SameSite=None; Partitioned");
  const v = docCookie(bf);
  assert.doesNotMatch(v, /qa_3p=|qa_3p_doc=|qa_3p_ins=/);
  assert.match(v, /qa_3p_ok=OK/);
  assert.match(v, /qa_3p_docp=P/);
  // Third-party request from the first-party page: same rule.
  fetchVia("https://b.test/set2", { bc: a, setCookie: ["r_plain=1", "r_part=1; Secure; SameSite=None; Partitioned"] });
  const fromTop = fetchVia("https://b.test/x", { bc: a }).cookie;
  assert.doesNotMatch(fromTop, /r_plain/);
  assert.match(fromTop, /r_part=1/);
  // b.test as first party sees none of its partitioned cookies under a.test.
  const b1p = tab("https://b.test/");
  assert.equal(docCookie(b1p), "");
  // First party may set CHIPS cookies (p bucket) and reads them with its own.
  FW.setDocumentCookie(a.currentWindowGlobal, "fp=1; path=/");
  FW.setDocumentCookie(a.currentWindowGlobal, "fpc=1; path=/; Secure; Partitioned");
  assert.match(docCookie(a), /fp=1/);
  assert.match(docCookie(a), /fpc=1/);
});

test("check 4: with optInPartitioning=false the legacy dFPI behaviour returns (partitioned, accepted)", () => {
  fresh({ "network.cookie.cookieBehavior.optInPartitioning": false });
  const a = tab("https://a.test/");
  const bf = frame(a, "https://b.test/f");
  fetchVia("https://b.test/set", { bc: bf, setCookie: "legacy=1; SameSite=None; Secure; Path=/" });
  assert.match(docCookie(bf), /legacy=1/);
  assert.equal(docCookie(tab("https://b.test/")), "");
});

test("check 4: cookieStore.set({partitioned}) in a cross-site frame", async () => {
  fresh();
  wireSync();
  const a = tab("https://a.test/");
  const bf = frame(a, "https://b.test/f");
  const { doc, win } = liveDoc(bf, "https://b.test/f");
  await win.cookieStore.set("plain", "1");
  assert.equal(doc.cookie, "", "unpartitioned CookieStore write rejected");
  await win.cookieStore.set({ name: "chips", value: "2", sameSite: "none", partitioned: true });
  assert.match(doc.cookie, /chips=2/);
});

// ---- F3 -------------------------------------------------------------------
test("F3: native gate pref follows arm state on the default branch only", () => {
  fresh({ "darkstr.mode": "homogeneous" });
  assert.equal(defaultPrefs.get(GATE), false, "inert by default");
  assert.equal(prefs.has(GATE), false, "never a user value");
  prefs.set("darkstr.mode", "pollution");
  FW.refreshPlan();
  assert.equal(defaultPrefs.get(GATE), true, "armed → gate on");
  assert.equal(prefs.has(GATE), false);
  prefs.set("darkstr.cookieFirewall.enabled", false);
  FW.refreshPlan();
  assert.equal(defaultPrefs.get(GATE), false, "disarmed → gate off");
  prefs.set("darkstr.cookieFirewall.enabled", true);
  prefs.set(GATE, true); // stray user value
  FW.refreshPlan();
  assert.equal(prefs.has(GATE), false, "stray user value cleared");
  FW.uninit();
  assert.equal(defaultPrefs.get(GATE), false, "shutdown → gate off");
});

function askGate(innerWindowID) {
  const bag = {
    props: { innerWindowID },
    QueryInterface() {
      return this;
    },
    getPropertyAsUint64(k) {
      if (!(k in this.props)) {
        throw new Error("NS_ERROR_NOT_AVAILABLE");
      }
      return this.props[k];
    },
    setPropertyAsAString(k, v) {
      this.props[k] = v;
    },
  };
  for (const o of observers["darkstr-cookie-gate"] || []) {
    o.observe(bag, "darkstr-cookie-gate", null);
  }
  return bag.props.decision;
}

test("F3: child answers the C++ gate — sandbox/unknown/policy-unavailable block, allowlist passes", () => {
  fresh({ "darkstr.cookieFirewall.allowlist": "allowed.test" });
  wireSync();
  assert.equal((observers["darkstr-cookie-gate"] || []).length, 1, "observer registered at module load");
  const s = tab("http://localhost/");
  const sd = liveDoc(s, "http://localhost/");
  assert.equal(askGate(s.currentWindowGlobal.innerWindowId), "block", "sandboxed document → real store closed");
  const f = frame(s, "http://127.0.0.1/f");
  liveDoc(f, "http://127.0.0.1/f");
  assert.equal(askGate(f.currentWindowGlobal.innerWindowId), "block", "cross-site iframe realm closed");
  const p = tab("http://allowed.test/");
  liveDoc(p, "http://allowed.test/");
  assert.equal(askGate(p.currentWindowGlobal.innerWindowId), "passthrough", "allowlisted top → stock");
  assert.equal(askGate(987654), "block", "unknown inner window fails closed");
  // policy unavailable (parent had no WindowGlobalParent yet) → closed
  const r = tab("http://localhost/r");
  wgById.delete(r.currentWindowGlobal.innerWindowId);
  liveDoc(r, "http://localhost/r");
  assert.equal(askGate(r.currentWindowGlobal.innerWindowId), "block");
  // about:blank frame inheriting the sandboxed principal: hooked + closed
  const blank = frame(s, "http://localhost/");
  blank.currentWindowGlobal.documentURI = uri("about:blank");
  liveDoc(blank, "http://localhost/");
  assert.equal(askGate(blank.currentWindowGlobal.innerWindowId), "block");
  // actor teardown forgets the window
  sd.actor.didDestroy();
  assert.equal(childMod._gateDecisionsForTest().has(s.currentWindowGlobal.innerWindowId), false);
  // disarm → reinstall answers passthrough
  prefs.set("darkstr.cookieFirewall.enabled", false);
  const d = tab("http://localhost/d");
  liveDoc(d, "http://localhost/d");
  assert.equal(askGate(d.currentWindowGlobal.innerWindowId), "passthrough");
});

test("F3: firewall hooks never call the native cookie accessors / CookieStore (real store stays empty)", async () => {
  fresh();
  wireSync();
  const native = { get: 0, set: 0, cs: 0 };
  const proto = {};
  Object.defineProperty(proto, "cookie", {
    configurable: true,
    get() {
      native.get++;
      return "";
    },
    set(_v) {
      native.set++;
    },
  });
  const t = tab("https://localhost/");
  const doc = Object.create(proto);
  doc.nodePrincipal = principal("https://localhost/");
  // Native members live on the prototypes, like the real DOM.
  const storeProto = {};
  for (const m of ["get", "getAll", "set", "delete"]) {
    Object.defineProperty(storeProto, m, {
      configurable: true,
      enumerable: true,
      writable: true,
      value() {
        native.cs++;
        return Promise.resolve(null);
      },
    });
  }
  const win = { Promise, cookieStore: Object.create(storeProto) };
  childActorFor(t.currentWindowGlobal, doc, win).handleEvent({ type: "DOMWindowCreated" });
  doc.cookie = "qa_native=x; path=/";
  void doc.cookie;
  await win.cookieStore.set("qa_native_cs", "y");
  await win.cookieStore.getAll();
  await win.cookieStore.delete("qa_native_cs");
  assert.deepEqual(native, { get: 0, set: 0, cs: 0 });
  assert.match(doc.cookie, /qa_native=x/, "sandbox holds the write instead");
});

test("F3: C++ gate patch covers document, CookieStore, workers and change events; default false", () => {
  const patch = readFileSync(join(root, "patches/0048r2-cookie-firewall-native-gate.patch"), "utf8");
  assert.match(patch, /name: darkstr\.cookieFirewall\.contentGate\n\+  type: RelaxedAtomicBool\n\+  value: false/);
  assert.match(patch, /\+    "darkstr",/, "pref group registered");
  assert.match(patch, /DarkstrContentGateBlocks\(aDocument, cookiePrincipal\)/, "document branch");
  assert.match(patch, /if \(StaticPrefs::darkstr_cookieFirewall_contentGate\(\)\) \{\n\+      return SecurityChecksResult::eDoNotContinue;/, "worker branch");
  const section = (f) => patch.split(/^diff --git /m).find((x) => x.startsWith(`a/${f} `)) || "";
  assert.match(section("dom/cookiestore/CookieStoreNotifier.cpp"), /DarkstrContentGateBlocks/, "change events");
  assert.match(section("netwerk/cookie/CookieCommons.cpp"), /CheckGlobalAndRetrieveCookiePrincipals/);
  assert.match(patch, /"darkstr-cookie-gate"/);
  assert.match(patch, /EqualsLiteral\("passthrough"\)/, "only passthrough opens the store");
  const fw = readFileSync(FW_FILE, "utf8");
  assert.match(fw, /getDefaultBranch\(""\)\.setBoolPref\(CONTENT_GATE_PREF/);
});

// ------------------------------------------------------------- 0052 ---
const CF_DIAG = [
  "darkstr.cookieFirewall.armed",
  "darkstr.cookieFirewall.lastEtld",
  "darkstr.cookieFirewall.lastSeed",
  "darkstr.cookieFirewall.lastDecision",
  "darkstr.cookieFirewall.lastPartition",
  "darkstr.cookieFirewall.lastInstall",
  "darkstr.cookieFirewall.lastError",
  "darkstr.cookieFirewall.lastHttpTopic",
  "darkstr.cookieFirewall.lastHttpEtld",
  "darkstr.cookieFirewall.lastCookieOut",
  "darkstr.cookieFirewall.lastCookieSet",
  "darkstr.cookieFirewall.lastCookieErr",
];
function s6Flow() {
  // Fable S6 shape: isolate mode, two sites, HTTP + document.cookie.
  const a = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: a, type: 6, setCookie: "qa_srv=1; Path=/" });
  fetchVia("https://a.test/echo", { bc: a });
  const b = tab("https://b.test/");
  fetchVia("https://b.test/", { bc: b, type: 6, setCookie: "qa_srv=1; Path=/" });
  fetchVia("https://b.test/echo", { bc: b });
  docCookie(a);
  docCookie(b);
}

test("0052: diagPrefs off (default) → no cookieFirewall diagnostic in prefs; values kept in memory", () => {
  fresh();
  s6Flow();
  for (const k of CF_DIAG) {
    assert.equal(prefs.has(k), false, k);
  }
  const d = FW.getDiagnostics();
  assert.equal(d["darkstr.cookieFirewall.armed"], true);
  assert.match(String(d["darkstr.cookieFirewall.lastCookieOut"]), /qa_srv=1/);
  assert.ok(d["darkstr.cookieFirewall.lastEtld"]);
});

test("0052: diagPrefs on → the same diagnostics are mirrored to prefs (QA / Proof)", () => {
  fresh({ "darkstr.debug.diagPrefs": true });
  s6Flow();
  assert.equal(prefs.get("darkstr.cookieFirewall.armed"), true);
  if (FW_FILE.includes("0060-files")) {
    // 0060 (no plaintext): site names / cookie values reach prefs only as
    // keyed digests; memory (getDiagnostics) keeps the readable value.
    assert.match(String(prefs.get("darkstr.cookieFirewall.lastCookieOut")), /^redacted:[0-9a-f]{8}:\d+$/);
    assert.match(String(FW.getDiagnostics()["darkstr.cookieFirewall.lastCookieOut"]), /qa_srv=1/);
    assert.equal(prefs.get("darkstr.cookieFirewall.lastEtld"), fwMod.redactDiag(FW.getDiagnostics()["darkstr.cookieFirewall.lastEtld"]));
    return;
  }
  assert.match(String(prefs.get("darkstr.cookieFirewall.lastCookieOut")), /qa_srv=1/);
  assert.equal(prefs.get("darkstr.cookieFirewall.lastEtld"), FW.getDiagnostics()["darkstr.cookieFirewall.lastEtld"]);
});
