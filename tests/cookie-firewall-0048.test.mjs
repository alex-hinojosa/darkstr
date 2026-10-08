/**
 * 0048: cookie firewall correctness — behavioural tests against the shipped
 * modules (patches/0048-files), with minimal XPCOM stubs.
 *
 * Covers Rowan QA B1 (cross-site iframe read), B2 (HttpOnly / attributes),
 * credentials 'omit', third-party partitioning by top site, N1 (re-hook per
 * document on reload / same-site navigation) and mirror staleness.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = join(root, "patches/0048-files");
const FW_URL = "moz-src:///browser/components/DarkstrCookieFirewall.sys.mjs";

// ---------------------------------------------------------------- stubs ---
const prefs = new Map();
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
globalThis.Services = {
  prefs: {
    getBoolPref: getP,
    getStringPref: getP,
    getIntPref: getP,
    setBoolPref: (k, v) => prefs.set(k, v),
    setStringPref: (k, v) => prefs.set(k, v),
    setIntPref: (k, v) => prefs.set(k, v),
    addObserver() {},
    removeObserver() {},
  },
  eTLD: {
    getBaseDomainFromHost: eTLDBase,
    getPublicSuffixFromHost(h) {
      const labels = h.split(".");
      const two = labels.slice(-2).join(".");
      return MULTI.has(two) ? two : labels[labels.length - 1];
    },
  },
  obs: { addObserver() {}, removeObserver() {} },
  ppmm: { addMessageListener() {}, removeMessageListener() {} },
  wm: { getEnumerator: () => [] },
  cpmm: { sendSyncMessage: () => [] },
};
globalThis.Ci = {
  nsIHttpChannel: {},
  nsIContentPolicy: { TYPE_DOCUMENT: 6, TYPE_SUBDOCUMENT: 7, TYPE_FETCH: 20 },
  nsIRequest: { LOAD_ANONYMOUS: 1 << 14 },
};
globalThis.Cu = {
  waiveXrays: (x) => x,
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

const fwMod = await import(pathToFileURL(join(FILES, "DarkstrCookieFirewall.sys.mjs")));
registry[FW_URL] = fwMod;
const childMod = await import(
  pathToFileURL(join(FILES, "DarkstrCookieFirewallChild.sys.mjs"))
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
function channel(url, { bc = null, type = 20, method = "GET", anonymous = false, setCookie = null, triggering = null, oa } = {}) {
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
      triggeringPrincipal: triggering,
      loadingPrincipal: bc?.currentWindowGlobal?.documentPrincipal || null,
      originAttributes: { userContextId: 0, privateBrowsingId: 0, ...(oa || {}) },
      cookieJarSettings: { partitionKey: "" },
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
    const top = tab("http://a.test/");
    fetchVia("http://a.test/", { bc: top, type: 6, setCookie: "top_sid=TOP; Path=/" });
    const ifr = frame(top, "http://b.test/frame");
    // iframe gets its own (third-party, partitioned) cookie via HTTP.
    fetchVia("http://b.test/set", { bc: ifr, setCookie: "b_sid=B; Path=/" });
    const childView = docCookie(ifr);
    assert.doesNotMatch(childView, /top_sid/, "top-site cookie must not leak into cross-site iframe");
    assert.match(childView, /^b_sid=/);
    const http = fetchVia("http://b.test/echo", { bc: ifr }).cookie;
    assert.equal(http, childView, "iframe document.cookie == iframe HTTP Cookie (no split-brain)");
    assert.match(docCookie(top), /^top_sid=/);
    assert.doesNotMatch(docCookie(top), /b_sid/);
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
    const a = tab("http://a.test/");
    const trackerInA = frame(a, "http://tracker.test/f");
    fetchVia("http://tracker.test/set", { bc: trackerInA, setCookie: "uid=TRACK" });
    assert.match(fetchVia("http://tracker.test/px", { bc: trackerInA }).cookie, /^uid=/);
    const c = tab("http://c.test/");
    const trackerInC = frame(c, "http://tracker.test/f");
    assert.equal(fetchVia("http://tracker.test/px", { bc: trackerInC }).cookie, "", "no cross-site tracking");
    assert.equal(docCookie(trackerInC), "");
    // The tracker as a first party is a different partition again.
    const t1 = tab("http://tracker.test/");
    assert.equal(fetchVia("http://tracker.test/", { bc: t1, type: 6 }).cookie, "");
    if (mode === "synthetic") {
      fetchVia("http://tracker.test/set", { bc: trackerInC, setCookie: "uid=TRACK" });
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

test("SameSite: Strict/Lax withheld from cross-site subresources, Lax on top-level GET", () => {
  fresh();
  const a = tab("http://a.test/");
  fetchVia("http://a.test/", {
    bc: a,
    type: 6,
    setCookie: ["st=1; SameSite=Strict", "lx=1; SameSite=Lax", "no=1"],
  });
  const c = tab("http://c.test/");
  const embedded = fetchVia("http://a.test/img", { bc: c }).cookie;
  assert.equal(embedded, "", "different partition entirely");
  // Same partition, cross-site context: a.test iframe → c.test frame → a.test request
  const cf = frame(a, "http://c.test/f");
  const req = fetchVia("http://a.test/api", { bc: cf }).cookie;
  assert.doesNotMatch(req, /st=|lx=/);
  assert.match(req, /no=1/);
  const nav = fetchVia("http://a.test/", {
    bc: a,
    type: 6,
    triggering: principal("http://c.test/"),
  }).cookie;
  assert.match(nav, /lx=1/);
  assert.doesNotMatch(nav, /st=1/);
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
function fakeDoc(url) {
  return { nodePrincipal: principal(url) };
}
function fakeWindow() {
  return {
    Promise,
    cookieStore: { get() {}, getAll() {}, set() {}, delete() {} },
  };
}

test("N1: reload / same-site navigation in the same tab re-hooks document.cookie", () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/?n=1");
  const win = fakeWindow(); // same WindowProxy across navigations
  const doc1 = fakeDoc("http://a.test/?n=1");
  childActorFor(t.currentWindowGlobal, doc1, win).handleEvent({ type: "DOMWindowCreated" });
  assert.ok(Object.getOwnPropertyDescriptor(doc1, "cookie")?.get, "first document hooked");
  for (const url of ["http://a.test/?n=2", "http://a.test/?n=2" /* reload */]) {
    const wg = load(t, url);
    const doc = fakeDoc(url);
    childActorFor(wg, doc, win).handleEvent({ type: "DOMWindowCreated" });
    const d = Object.getOwnPropertyDescriptor(doc, "cookie");
    assert.ok(d?.get, `document after navigation to ${url} is hooked`);
    assert.equal(childMod.installRecordFor(doc)?.ctx.decision, "sandbox");
  }
});

test("hook names carry no brand string", () => {
  fresh();
  wireSync();
  const t = tab("http://a.test/");
  const doc = fakeDoc("http://a.test/");
  const win = fakeWindow();
  childActorFor(t.currentWindowGlobal, doc, win).handleEvent({ type: "DOMWindowCreated" });
  const d = Object.getOwnPropertyDescriptor(doc, "cookie");
  assert.equal(d.get.name, "get cookie");
  assert.equal(d.set.name, "set cookie");
  for (const m of ["get", "getAll", "set", "delete"]) {
    assert.equal(win.cookieStore[m].name, m);
  }
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
  const blank = { nodePrincipal: principal("http://a.test/") };
  const actor = childActorFor(f.currentWindowGlobal, blank, win);
  actor.handleEvent({ type: "DOMWindowCreated" });
  assert.ok(Object.getOwnPropertyDescriptor(blank, "cookie")?.get, "about:blank hooked");
  let calls = 0;
  const sync = Services.cpmm.sendSyncMessage;
  Services.cpmm.sendSyncMessage = (...a) => (calls++, sync(...a));
  const framed = fakeDoc("http://a.test/frame");
  actor.document = framed; // same actor / innerWindowId, new document, no DOMWindowCreated
  f.currentWindowGlobal.documentURI = uri("http://a.test/frame"); // WindowGlobalChild::OnNewDocument
  actor.handleEvent({ type: "DOMDocElementInserted" });
  assert.ok(Object.getOwnPropertyDescriptor(framed, "cookie")?.get, "reused-window document hooked");
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
});

test("module header claim (line 29) is backed: strip + hook-every-document + residual named", () => {
  const src = readFileSync(join(FILES, "DarkstrCookieFirewall.sys.mjs"), "utf8");
  assert.match(src, /kept out of the primary profile jar/);
  assert.match(src, /before SetCookieHeaders/);
  assert.match(src, /ServiceWorkerGlobalScope\.cookieStore/);
  assert.doesNotMatch(src, /matches: \["\*:\/\/\*\/\*"\]/, "actor must also cover about:blank/srcdoc");
});
