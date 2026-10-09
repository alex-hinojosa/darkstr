/**
 * 0060 (Fable B8): cookie firewall coverage -- behavioural tests against the
 * shipped 0060 parent module (patches/0060-files) and the shipped child
 * (patches/0051-files), with the minimal XPCOM stubs of the 0048 suite.
 *
 *  - extension browsers / frames get a gate answer and the owning
 *    document's jar (no messageManagerGroups limit; _ownerTopSite);
 *  - worker (service worker) CookieStore follows the document's allowlist /
 *    sandbox decision and jar (cookieStoreRequest, "darkstr-cookie-store");
 *  - DarkstrCookieFirewallCleaner: every ClearDataService entry point, with
 *    partition-exact clears (#93 rule) and live-document deletes;
 *  - one pipeline with the 0061 hook point (setPipelineHook);
 *  - no plaintext site names / cookie values in prefs (0052 rule);
 *  - disarmed = stock (no answers, cleaners no-op).
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
const FW_FILE = join(root, "patches/0060-files/DarkstrCookieFirewall.sys.mjs");
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
  io: { newURI: (spec) => uri(spec) },
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
const actorRegistrations = [];
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
  registerWindowActor(name, opts) {
    actorRegistrations.push({ name, opts });
  },
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
const { DarkstrCookieFirewall: FW, DarkstrCookieCore: Core, DarkstrCookieFirewallCleaner: Cleaner, redactDiag } = fwMod;

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
// ===================================================================== 0060 ===
const F60 = join(root, "patches/0060-files");
const B = (top, part = "", oa = "0.0") => `${oa}|${top}${part ? "|" + part : ""}`;
/** "bucketKey:name" for every record in the parent jar, sorted. */
function jarList() {
  const out = [];
  for (const [k, b] of FW._jar || []) {
    for (const r of b.values()) {
      out.push(`${k}:${r.name}`);
    }
  }
  return out.sort();
}
const has = (k, name) => jarList().includes(`${k}:${name}`);
function setVia(bc, url, setCookie, extra = {}) {
  return fetchVia(url, { bc, setCookie, ...extra });
}
const PART = "; Path=/; Secure; SameSite=None; Partitioned";

// ---- extension browsers and frames -----------------------------------------
test("0060: actor registered for every message-manager group (extension browsers too), all frames", () => {
  fresh();
  const reg = actorRegistrations.filter((r) => r.name === "DarkstrCookieFirewall").pop();
  assert.ok(reg, "registered once armed");
  assert.equal("messageManagerGroups" in reg.opts, false, "no group limit (webext-browsers included)");
  assert.equal(reg.opts.allFrames, true);
  assert.equal(reg.opts.includeChrome, undefined, "chrome documents stay out");
  assert.equal("matches" in reg.opts, false);
});

test("0060: a web frame in an extension page uses its own first-party jar on every path", () => {
  fresh();
  wireSync();
  const ext = tab("moz-extension://3f1c2b7e-uuid/popup.html");
  // the frame's document load (embedded by the extension page)
  const nav = fetchVia("https://e.test/frame", { bc: ext, type: 7, setCookie: "e_srv=1; Path=/" });
  assert.equal(nav.ch.resHeaders.get("Set-Cookie"), "", "Set-Cookie kept out of the real jar");
  assert.ok(has(B("https://e.test"), "e_srv"), "first-party jar of the frame's own site");
  const f = frame(ext, "https://e.test/frame");
  const ctx = FW.installForWindowGlobal(f.currentWindowGlobal);
  assert.equal(ctx.decision, "sandbox", "an answer (main: passthrough = real jar)");
  assert.equal(ctx.kind, Core.KIND_1P);
  assert.equal(ctx.topBase, "e.test");
  // script view == HTTP view == a top-level e.test document's view
  const { doc } = liveDoc(f, "https://e.test/frame");
  assert.match(doc.cookie, /e_srv=1/);
  doc.cookie = "e_js=2; Path=/";
  const w = sent.filter((m) => m.name === "DarkstrCookieFirewall:SetDocumentCookie").pop();
  FW.setDocumentCookie(f.currentWindowGlobal, w.data.raw);
  const sub = fetchVia("https://e.test/echo", { bc: f });
  assert.equal(sub.cookie, "e_srv=1; e_js=2", "frame subresource gets the same jar");
  const owner = tab("https://e.test/");
  assert.equal(docCookie(owner), "e_srv=1; e_js=2", "same as the owning site's top-level document");
  assert.equal(docCookie(f), docCookie(owner));
  // gate: the frame's own child answers (block = sandbox hooks serve it)
  assert.equal(askGate(f.currentWindowGlobal.innerWindowId), "block");
});

test("0060: extension frame of an allowlisted site is passthrough on script, gate and HTTP", () => {
  fresh({ "darkstr.cookieFirewall.allowlist": "e.test" });
  wireSync();
  const ext = tab("moz-extension://3f1c2b7e-uuid/sidebar.html");
  const nav = fetchVia("https://e.test/frame", { bc: ext, type: 7, setCookie: "real=1" });
  assert.equal(nav.ch.resHeaders.get("Set-Cookie"), "real=1", "stock path");
  const f = frame(ext, "https://e.test/frame");
  liveDoc(f, "https://e.test/frame");
  assert.equal(FW.installForWindowGlobal(f.currentWindowGlobal).decision, "passthrough");
  assert.equal(askGate(f.currentWindowGlobal.innerWindowId), "passthrough");
  assert.deepEqual(jarList(), []);
});

test("0060: nested cross-site frame under an extension frame is partitioned under the owner", () => {
  fresh();
  wireSync();
  const ext = tab("moz-extension://3f1c2b7e-uuid/background.html");
  const e = frame(ext, "https://e.test/frame");
  fetchVia("https://f.test/inner", { bc: e, type: 7, setCookie: ["f_plain=1; Path=/", "f_part=1" + PART] });
  assert.deepEqual(jarList(), [`${B("https://e.test", "p")}:f_part`], "3p rules: only Partitioned, in e.test's partition");
  const inner = frame(e, "https://f.test/inner");
  const ctx = FW.installForWindowGlobal(inner.currentWindowGlobal);
  assert.equal(ctx.kind, Core.KIND_3P);
  assert.deepEqual(ctx.readKeys, [B("https://e.test", "p")]);
  assert.equal(docCookie(inner), "f_part=1");
  assert.equal(fetchVia("https://f.test/x", { bc: inner }).cookie, "f_part=1");
});

test("0060: web page → extension frame → web frame keeps the web top (unchanged)", () => {
  fresh();
  const a = tab("https://a.test/");
  const ext = frame(a, "moz-extension://3f1c2b7e-uuid/embed.html");
  const w = frame(ext, "https://w.test/");
  const ctx = FW.documentContext(w.currentWindowGlobal);
  assert.equal(ctx.topBase, "a.test");
  assert.equal(ctx.kind, Core.KIND_3P);
});

test("0060: a non-web partition key (moz-extension top) is ignored, not treated as a site", () => {
  fresh();
  fetchVia("https://e.test/sw-import", {
    bc: null,
    type: 20,
    loading: principal("https://e.test/"),
    partitionKey: "(moz-extension,3f1c2b7e-uuid)",
    setCookie: "x=1; Path=/",
  });
  assert.deepEqual(jarList(), [`${B("https://e.test")}:x`]);
});

// ---- worker (service worker) CookieStore -------------------------------------
function swReq(url, extra = {}) {
  return { op: "get", uri: uri(url), userContextId: 0, privateBrowsingId: 0, partitionKey: "", partitionedKey: "", thirdParty: false, name: "", matchName: false, path: "/", onlyFirstMatch: false, ...extra };
}
const names = (r) => (r.items || []).map((i) => `${i.name}=${i.value}`).join("; ");

for (const mode of ["isolate", "synthetic"]) {
  test(`[${mode}] 0060: service worker cookieStore reads and writes the document's jar`, () => {
    fresh({ "darkstr.cookieFirewall.mode": mode });
    wireSync();
    const t = tab("https://a.test/");
    fetchVia("https://a.test/", { bc: t, type: 6, setCookie: ["srv=1; Path=/", "ho=1; HttpOnly; Path=/"] });
    const { doc, win } = liveDoc(t, "https://a.test/");
    doc.cookie = "js=1; Path=/";
    FW.setDocumentCookie(t.currentWindowGlobal, sent.filter((m) => m.name.endsWith("SetDocumentCookie")).pop().data.raw);
    // first-party SW: unpartitioned attrs + partitioned attrs (Gecko sends both)
    const got = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { partitionedKey: "(https,a.test)" }));
    assert.equal(got.decision, "sandbox");
    assert.equal(names(got), docCookie(t), "worker view == document view (HttpOnly hidden)");
    assert.doesNotMatch(names(got), /ho=/);
    const one = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { name: "js", matchName: true, onlyFirstMatch: true }));
    assert.equal(one.items.length, 1);
    assert.equal(one.items[0].name, "js");
    // worker write → document, HTTP, and the same synthetic value a document write gets
    const set = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { op: "set", name: "sw", value: "1", session: true, sameSite: "strict" }));
    assert.equal(set.decision, "sandbox");
    assert.equal(set.ok, true);
    assert.match(doc.cookie, /sw=/, "delta reached the live document");
    assert.match(fetchVia("https://a.test/echo", { bc: t }).cookie, /sw=/);
    if (mode === "synthetic") {
      const sw = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { name: "sw", matchName: true })).items[0].value;
      assert.notEqual(sw, "1", "synthetic token, not the raw value");
      assert.match(sw, /^[0-9a-f]{16}$/);
    }
    const del = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { op: "delete", name: "sw" }));
    assert.equal(del.decision, "sandbox");
    assert.doesNotMatch(doc.cookie, /sw=/);
    assert.equal(names(FW.cookieStoreRequest(swReq("https://a.test/sw.js"))), docCookie(t));
  });
}

test("0060: third-party (framed) service worker uses the frame's partition, like its document", () => {
  fresh();
  wireSync();
  const a = tab("https://a.test/");
  const b = frame(a, "https://b.test/f");
  fetchVia("https://b.test/set", { bc: b, setCookie: "bp=1" + PART });
  fetchVia("https://b.test/", { bc: tab("https://b.test/"), type: 6, setCookie: "b1p=1; Path=/" });
  const req = swReq("https://b.test/sw.js", { partitionKey: "(https,a.test)", thirdParty: true });
  const got = FW.cookieStoreRequest(req);
  assert.equal(names(got), docCookie(b));
  assert.equal(names(got), "bp=1", "no first-party b.test cookie in a cross-site context");
  const set = FW.cookieStoreRequest({ ...req, op: "set", name: "swp", value: "2", partitioned: true, sameSite: "none", session: true });
  assert.equal(set.ok, true);
  assert.ok(has(B("https://a.test", "p"), "swp"), "lands in a.test's partition");
  const unpart = FW.cookieStoreRequest({ ...req, op: "set", name: "swu", value: "3", sameSite: "none", session: true });
  assert.equal(unpart.ok, false, "unpartitioned third-party write rejected like stock");
  // A-B-A: foreign-ancestor partition key → the "pf" bucket only
  const aba = FW.cookieStoreRequest(swReq("https://a.test/sw.js", { partitionKey: "(https,a.test,f)", thirdParty: true }));
  assert.equal(aba.decision, "sandbox");
  assert.deepEqual(aba.items, []);
});

test("0060: worker cookieStore follows the allowlist and fails closed without a knowable top", () => {
  fresh({ "darkstr.cookieFirewall.allowlist": "allowed.test" });
  assert.deepEqual(FW.cookieStoreRequest(swReq("https://allowed.test/sw.js")), { decision: "passthrough" });
  assert.deepEqual(
    FW.cookieStoreRequest(swReq("https://x.test/sw.js", { partitionKey: "(https,allowed.test)", thirdParty: true })),
    { decision: "passthrough" },
    "a worker framed under an allowlisted top is passthrough, like its document"
  );
  const closed = FW.cookieStoreRequest(swReq("https://x.test/sw.js", { thirdParty: true }));
  assert.equal(closed.decision, "sandbox");
  assert.deepEqual(closed.items, []);
  assert.equal(FW.cookieStoreRequest(swReq("https://x.test/sw.js", { thirdParty: true, op: "set", name: "n", value: "v" })).ok, false);
  assert.deepEqual(jarList(), [], "fail closed writes nothing");
  assert.deepEqual(FW.cookieStoreRequest(swReq("moz-extension://u/sw.js")), { decision: "passthrough" }, "non-web: stock");
});

test("0060: CookieStoreParent property bag round trip (\"darkstr-cookie-store\")", () => {
  fresh();
  fetchVia("https://a.test/", { bc: tab("https://a.test/"), type: 6, setCookie: ["k1=v1; Path=/", "k2=v2; Path=/"] });
  const obs = observers["darkstr-cookie-store"];
  assert.ok(obs?.length >= 1, "observer registered by init()");
  const mkBag = (props) => ({
    props: { ...props },
    QueryInterface() {
      return this;
    },
    getPropertyAsAString(k) {
      if (!(k in this.props)) throw new Error("NS_ERROR_NOT_AVAILABLE");
      return String(this.props[k]);
    },
    getPropertyAsBool(k) {
      if (!(k in this.props)) throw new Error("NS_ERROR_NOT_AVAILABLE");
      return !!this.props[k];
    },
    getPropertyAsInt64(k) {
      if (!(k in this.props)) throw new Error("NS_ERROR_NOT_AVAILABLE");
      return Number(this.props[k]);
    },
    setPropertyAsAString(k, v) {
      this.props[k] = v;
    },
    setPropertyAsUint32(k, v) {
      this.props[k] = v;
    },
    setPropertyAsBool(k, v) {
      this.props[k] = v;
    },
  });
  const bag = mkBag({ op: "get", uri: "https://a.test/sw.js", userContextId: 0, privateBrowsingId: 0, partitionKey: "", partitionedKey: "(https,a.test)", thirdParty: false, path: "/" });
  obs.at(-1).observe(bag, "darkstr-cookie-store");
  assert.equal(bag.props.decision, "sandbox");
  assert.equal(bag.props.count, 2);
  assert.deepEqual([bag.props.name0, bag.props.value0, bag.props.name1, bag.props.value1], ["k1", "v1", "k2", "v2"]);
  const set = mkBag({ op: "set", uri: "https://a.test/sw.js", partitionKey: "", thirdParty: false, name: "k3", value: "v3", session: true, sameSite: "lax", path: "/" });
  obs.at(-1).observe(set, "darkstr-cookie-store");
  assert.equal(set.props.ok, true);
  assert.ok(has(B("https://a.test"), "k3"));
  prefs.set("darkstr.cookieFirewall.enabled", false);
  FW.refreshPlan();
  const off = mkBag({ op: "get", uri: "https://a.test/sw.js", partitionKey: "" });
  obs.at(-1).observe(off, "darkstr-cookie-store");
  assert.equal(off.props.decision, "passthrough", "disarmed: stock store");
  assert.equal("count" in off.props, false);
});

test("0060: C++ shape: parent asks the firewall first and fails closed; workers no longer blocked in content", () => {
  const csp = readFileSync(join(F60, "CookieStoreParent.cpp"), "utf8");
  assert.match(csp, /"darkstr-cookie-store"/);
  assert.equal((csp.match(/DarkstrCookieStoreFirewallOwns\(bag\)/g) || []).length, 3, "get, set, delete");
  assert.match(csp, /if \(!StaticPrefs::darkstr_cookieFirewall_contentGate\(\)\) \{\n    return false;\n  \}/, "gate off: stock, no notification");
  assert.match(csp, /GetPropertyAsAString\(u"decision"_ns, decision\)\)\) \{\n    return true;\n  \}/, "no answer: fail closed");
  // the firewall's answer comes after the stock content-process security check
  for (const op of ["get", "set", "delete"]) {
    const i = csp.indexOf(`DarkstrCookieStoreBag(\n        "${op}"`);
    assert.ok(i > 0, op);
    assert.ok(csp.lastIndexOf("CheckContentProcessSecurity(aParent", i) > csp.lastIndexOf("::", i - 4000), `${op}: after security check`);
  }
  const cc = readFileSync(join(F60, "CookieCommons.cpp"), "utf8");
  const worker = cc.slice(cc.indexOf("if (!NS_IsMainThread()) {\n    MOZ_ASSERT(!aDocument);"), cc.indexOf("cookiePrincipal = workerPrivate->GetPrincipal();"));
  assert.doesNotMatch(worker, /darkstr_cookieFirewall_contentGate/, "no blanket worker block");
  assert.match(worker, /darkstr 0060/);
  assert.match(cc, /if \(DarkstrContentGateBlocks\(aDocument, cookiePrincipal\)\)/, "documents keep the gate");
});

// ---- ClearDataService cleaners ------------------------------------------------
/** A jar with every bucket shape: 1p, CHIPS 1p, framed (p), A-B-A (pf), container, private. */
function populate() {
  const a = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: a, type: 6, setCookie: ["a1=1; Path=/", "a_chips=1" + PART] });
  const ba = frame(a, "https://b.test/f");
  fetchVia("https://b.test/set", { bc: ba, setCookie: "b_in_a=1" + PART });
  const aba = frame(ba, "https://a.test/aba");
  fetchVia("https://a.test/set", { bc: aba, setCookie: "a_aba=1" + PART });
  const c = tab("https://c.test/");
  fetchVia("https://c.test/", { bc: c, type: 6, setCookie: "c1=1; Path=/" });
  const bc_ = frame(c, "https://b.test/f");
  fetchVia("https://b.test/set", { bc: bc_, setCookie: "b_in_c=1" + PART });
  const b = tab("https://b.test/");
  fetchVia("https://b.test/", { bc: b, type: 6, setCookie: "b1=1; Path=/" });
  const cb = frame(b, "https://c.test/f");
  fetchVia("https://c.test/set", { bc: cb, setCookie: "c_in_b=1" + PART });
  const sub = tab("https://sub.b.test/");
  fetchVia("https://sub.b.test/", { bc: sub, type: 6, setCookie: ["sub1=1; Path=/", "dom=1; Domain=b.test; Path=/"] });
  const u1 = tab("https://a.test/", { userContextId: 1 });
  fetchVia("https://a.test/", { bc: u1, type: 6, oa: { userContextId: 1 }, setCookie: "a_u1=1; Path=/" });
  const pb = tab("https://a.test/", { privateBrowsingId: 1 });
  fetchVia("https://a.test/", { bc: pb, type: 6, oa: { privateBrowsingId: 1 }, setCookie: "a_pb=1; Path=/" });
  return { a, ba, aba, c, bc: bc_, b, cb, sub, u1, pb };
}
const ALL = [
  `${B("https://a.test")}:a1`,
  `${B("https://a.test", "p")}:a_chips`,
  `${B("https://a.test", "p")}:b_in_a`,
  `${B("https://a.test", "pf")}:a_aba`,
  `${B("https://b.test")}:b1`,
  `${B("https://b.test")}:dom`,
  `${B("https://b.test")}:sub1`,
  `${B("https://b.test", "p")}:c_in_b`,
  `${B("https://c.test")}:c1`,
  `${B("https://c.test", "p")}:b_in_c`,
  `${B("https://a.test", "", "0.1")}:a_pb`,
  `${B("https://a.test", "", "1.0")}:a_u1`,
].sort();
const without = (...gone) => ALL.filter((x) => !gone.includes(x.split(":").pop())).sort();
const OA = (extra = {}) => ({ userContextId: 0, privateBrowsingId: 0, firstPartyDomain: "", geckoViewSessionContextId: "", partitionKey: "", ...extra });

test("0060: jar fixture covers every bucket shape", () => {
  fresh();
  populate();
  assert.deepEqual(jarList(), ALL);
});

test("0060: Clear-Site-Data from a framed site clears only that partition (principal with partitionKey)", async () => {
  fresh();
  populate();
  // ClearSiteData: DeleteDataFromPrincipal(storagePrincipal) -- b.test framed in a.test
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA({ partitionKey: "(https,a.test)" })));
  assert.deepEqual(jarList(), without("b_in_a"), "b.test's first-party jar and its partition under c.test survive");
  // with a port in the partition key (loopback test hosts)
  fresh();
  populate();
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA({ partitionKey: "(https,a.test,8481)" })));
  assert.deepEqual(jarList(), without("b_in_a"));
});

test("0060: Clear-Site-Data from a top-level site clears only its unpartitioned host cookies (like stock)", async () => {
  fresh();
  populate();
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA()));
  // Gecko RemoveCookiesFromExactHost matches the raw host: a Domain=b.test
  // cookie (raw host "b.test") goes too; sub.b.test and partitions stay.
  assert.deepEqual(jarList(), without("b1", "dom"), "exact host b.test, partitionKey \"\"");
  await Cleaner.deleteByHost("sub.b.test", OA());
  assert.deepEqual(jarList(), without("b1", "dom", "sub1"));
});

test("0060: A-B-A clear hits only the foreign-ancestor partition", async () => {
  fresh();
  populate();
  await Cleaner.deleteByPrincipal(principal("https://a.test/", OA({ partitionKey: "(https,a.test,f)" })));
  assert.deepEqual(jarList(), without("a_aba"));
  await Cleaner.deleteByPrincipal(principal("https://a.test/", OA({ partitionKey: "(https,a.test)" })));
  assert.deepEqual(jarList(), without("a_aba", "a_chips"), "CHIPS first-party partition");
});

test("0060: Forget About This Site (deleteBySite, any OA) clears the site everywhere plus its partitions", async () => {
  fresh();
  populate();
  await Cleaner.deleteBySite("b.test", {}, true);
  assert.deepEqual(
    jarList(),
    without("b1", "sub1", "dom", "b_in_a", "b_in_c", "c_in_b"),
    "b.test cookies in every partition + everything partitioned under top b.test"
  );
  fresh();
  populate();
  await Cleaner.deleteBySite("a.test", { userContextId: 1 }, true);
  assert.deepEqual(jarList(), without("a_u1"), "pattern narrows to the container");
  fresh();
  populate();
  await Cleaner.deleteBySite("a.test", { privateBrowsingId: 0 }, true);
  assert.deepEqual(jarList(), without("a1", "a_chips", "b_in_a", "a_aba", "a_u1"));
});

test("0060: Clear Recent History (range) and Everything", async () => {
  fresh();
  populate();
  const cut = Date.now() * 1000;
  for (const [, bkt] of FW._jar) {
    for (const r of bkt.values()) {
      r.ctime = cut - 7200 * 1e6; // two hours ago
    }
  }
  const t = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: t, type: 6, setCookie: "fresh=1; Path=/" });
  fetchVia("https://a.test/", { bc: t, type: 6, setCookie: "a1=2; Path=/" }); // overwrite keeps creation time
  await Cleaner.deleteByRange(cut - 3600 * 1e6, cut + 3600 * 1e6); // last hour
  assert.deepEqual(jarList(), ALL, "only the cookie created in the range is gone; overwritten a1 is old");
  await Cleaner.deleteAll();
  assert.deepEqual(jarList(), []);
});

test("0060: container removal / private end (deleteByOriginAttributes)", async () => {
  fresh();
  populate();
  await Cleaner.deleteByOriginAttributes(JSON.stringify({ userContextId: 1 }));
  assert.deepEqual(jarList(), without("a_u1"));
  await Cleaner.deleteByOriginAttributes(JSON.stringify({ privateBrowsingId: 1 }));
  assert.deepEqual(jarList(), without("a_u1", "a_pb"));
  await Cleaner.deleteByOriginAttributes(JSON.stringify({ partitionKeyPattern: { baseDomain: "a.test" } }));
  assert.deepEqual(jarList(), without("a_u1", "a_pb", "a_chips", "b_in_a", "a_aba"), "partitionKeyPattern: partitions under a.test only");
  await Cleaner.deleteByOriginAttributes("not json");
  await Cleaner.deleteByLocalFiles({});
  assert.equal(jarList().length, ALL.length - 5);
});

test("0060: clear-on-quit sanitizer shape: kept site's first party survives, its partitions elsewhere go", async () => {
  fresh();
  populate();
  // Sanitizer maybeSanitizeSessionPrincipals: every non-kept principal, plus
  // the kept site's partitioned principals under non-kept tops (#93 shape).
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA({ partitionKey: "(https,a.test)" })));
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA({ partitionKey: "(https,c.test)" })));
  for (const h of ["https://a.test/", "https://c.test/", "https://sub.b.test/"]) {
    await Cleaner.deleteByPrincipal(principal(h, OA()));
  }
  assert.deepEqual(jarList(), without("b_in_a", "b_in_c", "a1", "c1", "sub1"), "b.test (kept) first-party jar intact");
});

test("0060: a purge reaches live documents (no stale document.cookie)", async () => {
  fresh();
  wireSync();
  const a = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: a, type: 6, setCookie: ["k=1; Path=/", "keep=1; Path=/"] });
  const { doc } = liveDoc(a, "https://a.test/");
  const f = frame(a, "https://b.test/f");
  fetchVia("https://b.test/set", { bc: f, setCookie: "bp=1" + PART });
  const { doc: fdoc } = liveDoc(f, "https://b.test/f");
  assert.equal(fdoc.cookie, "bp=1");
  await Cleaner.deleteByPrincipal(principal("https://b.test/", OA({ partitionKey: "(https,a.test)" })));
  assert.equal(fdoc.cookie, "", "framed document's mirror purged");
  assert.equal(doc.cookie, "k=1; keep=1", "top document untouched");
  await Cleaner.deleteBySite("a.test", {}, true);
  assert.equal(doc.cookie, "");
  assert.equal(fetchVia("https://a.test/echo", { bc: a }).cookie, "");
  const st = FW.getCoverageStats();
  assert.ok(st.purges >= 2 && st.purged >= 3);
});

// ---- clear-on-quit: PrincipalsCollector lists the sandbox jar ------------------
/** Gecko OriginAttributes::CreateSuffix shape (only non-default fields). */
function oaSuffix(oa) {
  const p = [];
  if (oa.userContextId) p.push(`userContextId=${oa.userContextId}`);
  if (oa.privateBrowsingId) p.push(`privateBrowsingId=${oa.privateBrowsingId}`);
  if (oa.partitionKey) p.push(`partitionKey=${encodeURIComponent(oa.partitionKey).replace(/\(/g, "%28").replace(/\)/g, "%29")}`);
  return p.length ? "^" + p.join("&") : "";
}
/** Stock collector: "https://" + host+suffix → principal. */
function collectorPrincipal(hostSuffix) {
  const [host, suffix = ""] = hostSuffix.split("^");
  const q = new URLSearchParams(suffix);
  return principal(`https://${host}/`, {
    userContextId: Number(q.get("userContextId") || 0),
    privateBrowsingId: Number(q.get("privateBrowsingId") || 0),
    partitionKey: q.get("partitionKey") || "",
  });
}
test("0060: sandboxCookieHosts gives the collector Gecko's rawHost+suffix for every sandboxed cookie", () => {
  fresh();
  ChromeUtils.originAttributesToSuffix = oaSuffix;
  populate();
  assert.deepEqual(FW.sandboxCookieHosts().sort(), [
    "a.test",
    "a.test^partitionKey=%28https%2Ca.test%29",
    "a.test^partitionKey=%28https%2Ca.test%2Cf%29",
    "a.test^privateBrowsingId=1",
    "a.test^userContextId=1",
    "b.test",
    "b.test^partitionKey=%28https%2Ca.test%29",
    "b.test^partitionKey=%28https%2Cc.test%29",
    "c.test",
    "c.test^partitionKey=%28https%2Cb.test%29",
    "sub.b.test",
  ]);
  fresh({ "darkstr.cookieFirewall.enabled": false });
  assert.deepEqual(FW.sandboxCookieHosts(), [], "disarmed: nothing to add (stock)");
});
test("0060: clear-on-quit with a persist-data-on-shutdown exception: same outcome as stock on the sandbox jar", async () => {
  fresh();
  ChromeUtils.originAttributesToSuffix = oaSuffix;
  populate();
  // Sanitizer.maybeSanitizeSessionPrincipals with an exception for b.test:
  // first-party principals under b.test kept (host walk), partitioned ones
  // kept only when the partition's top site is b.test (#93 rule).
  const keep = (p) => {
    const pk = p.originAttributes.partitionKey;
    if (!pk) return Core.hasRootDomain(p.URI.host, "b.test");
    return /^\(https?,b\.test[,)]/.test(pk);
  };
  for (const h of FW.sandboxCookieHosts()) {
    const p = collectorPrincipal(h);
    if (!keep(p)) await Cleaner.deleteByPrincipal(p, true);
  }
  assert.deepEqual(jarList(), [
    `${B("https://b.test")}:b1`,
    `${B("https://b.test")}:dom`,
    `${B("https://b.test")}:sub1`,
    `${B("https://b.test", "p")}:c_in_b`,
  ], "kept site's own jar + what is partitioned under it; b.test framed elsewhere is cleared");
});
test("0060: PrincipalsCollector adds the sandbox hosts to the cookie host set (and stays stock outside Darkstr)", () => {
  const pc = readFileSync(join(F60, "PrincipalsCollector.sys.mjs"), "utf8");
  const i = pc.indexOf("let hosts = new Set();"), j = pc.indexOf("DarkstrCookieFirewall.sandboxCookieHosts()"), k = pc.indexOf('progress.step = "principals-host-cookie";');
  assert.ok(i > 0 && j > i && k > j, "after the Services.cookies loop, before principals are built");
  assert.match(pc, /hosts\.add\(h\);/);
  assert.match(pc, /\} catch \(_e\) \{\n      \/\/ Not a Darkstr browser build/);
});

test("0060: ClearDataService wires the cleaner under CLEAR_COOKIES (and so Forget / CSD / sanitizer flags)", () => {
  const cds = readFileSync(join(F60, "ClearDataService.sys.mjs"), "utf8");
  assert.match(cds, /flag: Ci\.nsIClearDataService\.CLEAR_COOKIES,\n    cleaners: \[CookieCleaner, DarkstrCookieFirewallCleaner\],/);
  assert.match(cds, /"moz-src:\/\/\/browser\/components\/DarkstrCookieFirewall\.sys\.mjs"\n      \)\.DarkstrCookieFirewallCleaner/);
  for (const m of ["deleteAll", "deleteByPrincipal", "deleteBySite", "deleteByHost", "deleteByRange", "deleteByOriginAttributes", "deleteByLocalFiles"]) {
    assert.equal(typeof Cleaner[m], "function", m);
  }
  assert.match(cds, /const DarkstrPersonaSeedCleaner = \{/, "0056 cleaner kept");
});

test("0060: bucketMatchesPattern = Gecko OriginAttributesPattern semantics", () => {
  const m = (key, pat) => Core.bucketMatchesPattern(Core.parseBucketKey(key), pat);
  assert.equal(m("0.0|https://a.test", {}), true);
  assert.equal(m("0.0|https://a.test", { partitionKey: "" }), true);
  assert.equal(m("0.0|https://a.test|p", { partitionKey: "" }), false);
  assert.equal(m("0.0|https://a.test|p", { partitionKey: "(https,a.test)" }), true);
  assert.equal(m("0.0|https://a.test|p", { partitionKey: "(http,a.test)" }), false, "scheme");
  assert.equal(m("0.0|https://a.test|pf", { partitionKey: "(https,a.test)" }), false, "foreign bit");
  assert.equal(m("0.0|https://a.test|pf", { partitionKey: "(https,a.test,f)" }), true);
  assert.equal(m("0.0|http://a.test|p", { partitionKey: "(http,a.test,8481)" }), true, "port ignored");
  assert.equal(m("1.0|https://a.test", { userContextId: 0 }), false);
  assert.equal(m("0.1|https://a.test", { privateBrowsingId: 1 }), true);
  assert.equal(m("0.0|https://a.test", { firstPartyDomain: "a.test" }), false);
  assert.equal(m("0.0|https://a.test", { partitionKeyPattern: { baseDomain: "a.test" } }), false);
  assert.equal(m("0.0|https://a.test|p", { partitionKeyPattern: { baseDomain: "a.test", foreignByAncestorContext: false } }), true);
  assert.equal(Core.parseBucketKey("garbage"), null);
});

// ---- one pipeline / 0061 hook point -------------------------------------------
test("0060: every write path goes through the pipeline; the 0061 hook sees and decides all of them", async () => {
  fresh({ "darkstr.cookieFirewall.mode": "synthetic" });
  wireSync();
  const seen = [];
  const prev = FW.setPipelineHook({
    seedFor: (info) => (seen.push(`seed:${info.source}`), 7),
    valueFor: (info) => (seen.push(`value:${info.source}`), `rot-${info.record.name}`),
  });
  assert.equal(prev, null, "0060 ships no hook");
  const t = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: t, type: 6, setCookie: "h=1; Path=/" });
  const { doc } = liveDoc(t, "https://a.test/");
  doc.cookie = "d=1; Path=/";
  FW.setDocumentCookie(t.currentWindowGlobal, sent.filter((m) => m.name.endsWith("SetDocumentCookie")).pop().data.raw);
  FW.cookieStoreRequest(swReq("https://a.test/sw.js", { op: "set", name: "w", value: "1", session: true }));
  assert.deepEqual(
    [...new Set(seen)].sort(),
    ["seed:document", "seed:http", "seed:worker-cookieStore", "value:document", "value:http", "value:worker-cookieStore"]
  );
  assert.equal(docCookie(t), "h=rot-h; d=rot-d; w=rot-w");
  assert.equal(doc.cookie, "h=rot-h; d=rot-d; w=rot-w", "content cache converged on the parent's value");
  assert.equal(FW.installForWindowGlobal(t.currentWindowGlobal).seed, 7, "document context seed via the hook");
  FW.setPipelineHook(null);
  fetchVia("https://a.test/", { bc: t, type: 6, setCookie: "h2=1; Path=/" });
  assert.match(docCookie(t), /h2=[0-9a-f]{16}/, "no hook: stock synthetic tokens");
  const src = readFileSync(FW_FILE, "utf8");
  assert.match(src, /0061 per-site rotation plugs in with setPipelineHook/);
  // the only store call sites are _admit and _purge (and _store itself)
  assert.equal((src.match(/this\._store\(/g) || []).length, 1, "_store only called from _admit");
});

// ---- no plaintext -----------------------------------------------------------
test("0060: no site name or cookie value reaches prefs, even with darkstr.debug.diagPrefs", () => {
  fresh({ "darkstr.debug.diagPrefs": true });
  s6Flow60();
  const leaks = [];
  for (const [k, v] of prefs) {
    if (!k.startsWith("darkstr.cookieFirewall.")) {
      continue;
    }
    const t = String(v);
    for (const needle of ["qa_srv", "a.test", "b.test", "https://", "S6-"]) {
      if (t.includes(needle)) {
        leaks.push(`${k}=${t}`);
      }
    }
  }
  assert.deepEqual(leaks, []);
  assert.match(String(prefs.get("darkstr.cookieFirewall.lastCookieOut")), /^redacted:[0-9a-f]{8}:\d+$/);
  assert.match(String(prefs.get("darkstr.cookieFirewall.lastEtld")), /^redacted:/);
  assert.equal(prefs.get("darkstr.cookieFirewall.armed"), true, "non-identifying diagnostics unchanged");
  assert.equal(typeof prefs.get("darkstr.cookieFirewall.lastSeed"), "number");
  // memory (chrome-only) keeps the readable value for QA
  assert.match(String(FW.getDiagnostics()["darkstr.cookieFirewall.lastCookieOut"]), /qa_js=S6-b1/);
  assert.equal(redactDiag("x"), redactDiag("x"), "stable within a session");
  assert.notEqual(redactDiag("a.test"), redactDiag("b.test"));
  assert.equal(redactDiag(""), "");
  const src = readFileSync(FW_FILE, "utf8");
  // console messages: a fixed string plus the exception, nothing interpolated
  const calls = [...src.matchAll(/console\.\w+\(([\s\S]*?)\);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.ok(calls.length >= 5);
  for (const c of calls) {
    assert.match(c, /^"[^"$`]*",? ?(e|error)?,?$/, c);
  }
});
function s6Flow60() {
  const a = tab("https://a.test/");
  fetchVia("https://a.test/", { bc: a, type: 6, setCookie: "qa_srv=1; Path=/" });
  fetchVia("https://a.test/echo", { bc: a });
  const b = tab("https://b.test/");
  FW.setDocumentCookie(b.currentWindowGlobal, "qa_js=S6-b1; Path=/");
  fetchVia("https://b.test/echo", { bc: b });
}

// ---- firewall off = stock --------------------------------------------------------
test("0060: firewall off (default prefs) = stock: no answers, cleaners no-op, no registration", async () => {
  actorRegistrations.length = 0;
  fresh({
    "darkstr.mode": "homogeneous",
    "darkstr.nativePersonaHooks": false,
    "darkstr.cookieFirewall.enabled": false,
    "darkstr.cookieFirewall.mode": "synthetic",
  });
  assert.equal(actorRegistrations.length, 0, "actor never registered while disarmed");
  assert.deepEqual(FW.cookieStoreRequest(swReq("https://a.test/sw.js")), { decision: "passthrough" });
  const ext = tab("moz-extension://u/p.html");
  const r = fetchVia("https://e.test/f", { bc: ext, type: 7, setCookie: "s=1" });
  assert.equal(r.ch.resHeaders.get("Set-Cookie"), "s=1");
  assert.equal(r.cookie, null);
  await Cleaner.deleteAll();
  await Cleaner.deleteBySite("a.test", {});
  assert.deepEqual(jarList(), []);
  assert.equal(FW.getCoverageStats().purges, 0);
  for (const flag of ["armed"]) {
    assert.equal(prefs.has("darkstr.cookieFirewall." + flag), false, "no diagnostics in prefs");
  }
});


// ---- no plaintext: persona site diagnostics too ----------------------------------
test("0060: persona lastEtld / lastDecision reach prefs.js only as digests (diagPrefs on); memory keeps them", () => {
  const src = readFileSync(join(F60, "DarkstrNativePersona.sys.mjs"), "utf8");
  const a = src.indexOf("const DIAG_PREFS_PREF = "), b = src.indexOf('const ACTOR_NAME = "DarkstrNativePersona";');
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b).replace("export function redactDiag", "function redactDiag");
  const written = new Map();
  const Svc = { prefs: { getBoolPref: (k, d) => (k === "darkstr.debug.diagPrefs" ? true : d),
    setStringPref: (k, v) => written.set(k, v), setIntPref: (k, v) => written.set(k, v), setBoolPref: (k, v) => written.set(k, v) } };
  const mk = new Function("Services", 'const LAST_ETLD_PREF = "darkstr.persona.lastEtld"; const LAST_DECISION_PREF = "darkstr.persona.lastDecision";\n' + body + "\nreturn { diagPrefs, redactDiag };");
  const { diagPrefs, redactDiag } = mk(Svc);
  const dec = JSON.stringify({ site: "secret-site.test", armed: true });
  diagPrefs.setStringPref("darkstr.persona.lastEtld", "secret-site.test");
  diagPrefs.setStringPref("darkstr.persona.lastDecision", dec);
  diagPrefs.setIntPref("darkstr.persona.effectiveSeed", 7);
  assert.match(written.get("darkstr.persona.lastEtld"), /^redacted:[0-9a-f]{8}:16$/);
  assert.equal(written.get("darkstr.persona.lastDecision"), redactDiag(dec));
  assert.ok(![...written.values()].some((v) => String(v).includes("secret-site")), "no site name in prefs");
  assert.equal(written.get("darkstr.persona.effectiveSeed"), 7, "non-site diagnostics unchanged");
  const snap = diagPrefs.snapshot();
  assert.equal(snap["darkstr.persona.lastEtld"], "secret-site.test", "getDiagnostics keeps the readable value");
  assert.equal(snap["darkstr.persona.lastDecision"], dec);
  // the 0052 facade text itself is untouched (identical-facade invariant)
  assert.match(src, /const diagPrefs = \{\n  _write\(setter, name, value\) \{\n    gDiag\.set\(name, value\);/);
});
