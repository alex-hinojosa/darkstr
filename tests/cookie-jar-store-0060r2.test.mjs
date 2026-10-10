/**
 * 0060r2 (Alex 2026-10-09, Proof FAIL on #99): kept sites keep their sandbox
 * cookies across a restart -- encrypted at rest like the 0056 seed store.
 * Behavioural tests against patches/0060-files/DarkstrCookieFirewall.sys.mjs
 * with an in-memory profile directory, OSKeyStore and permission manager.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FW_PATH = join(root, "patches/0060-files/DarkstrCookieFirewall.sys.mjs");

// ---------------------------------------------------------------- stubs
const prefs = new Map();
const getP = (k, d) => (prefs.has(k) ? prefs.get(k) : d);
const files = new Map(); // path -> { bytes: Uint8Array, mode }
const dirs = new Map(); // path -> mode
const secrets = new Map(); // label -> raw key bytes (the "Keychain")
const perms = []; // { type, host, capability }
const observers = new Map();
globalThis.Services = {
  appinfo: { processType: 0, version: "156.0.1" },
  prefs: {
    getBoolPref: getP, getStringPref: getP, getCharPref: getP, getIntPref: getP,
    setBoolPref: (k, v) => prefs.set(k, v), setStringPref: (k, v) => prefs.set(k, v), setIntPref: (k, v) => prefs.set(k, v),
    prefHasUserValue: (k) => prefs.has(k), clearUserPref: (k) => prefs.delete(k),
    addObserver() {}, removeObserver() {},
    getDefaultBranch: () => ({ setBoolPref() {}, getBoolPref: (_k, d) => d }),
  },
  perms: { getAllByTypes: (types) => perms.filter((p) => types.includes(p.type)).map((p) => ({ type: p.type, capability: p.capability, principal: { host: p.host } })) },
  obs: {
    addObserver: (o, t) => observers.set(t, [...(observers.get(t) || []), o]),
    removeObserver() {}, notifyObservers() {},
  },
  eTLD: { getBaseDomainFromHost: (h) => h.split(".").slice(-2).join(".") },
  ppmm: { addMessageListener() {}, removeMessageListener() {} },
  wm: { getEnumerator: () => [] },
};
globalThis.Ci = {
  nsIXULRuntime: { PROCESS_TYPE_DEFAULT: 0 },
  nsIPermissionManager: { ALLOW_ACTION: 1 },
  nsICookiePermission: { ACCESS_SESSION: 8 },
  nsIPermission: {},
  nsIHttpChannel: {},
};
const ks = {
  async asyncGenerateSecret(label) { secrets.set(label, crypto.getRandomValues(new Uint8Array(32))); return ""; },
  async asyncSecretAvailable(label) { return secrets.has(label); },
  async asyncEncryptBytes(label, bytes) {
    const k = secrets.get(label); const b = Uint8Array.from(bytes).map((x, i) => x ^ k[i % 32]);
    return Buffer.from(b).toString("base64");
  },
  async asyncDecryptBytes(label, b64) {
    const k = secrets.get(label); return Array.from(Buffer.from(b64, "base64")).map((x, i) => x ^ k[i % 32]);
  },
  async asyncDeleteSecret(label) { secrets.delete(label); },
};
globalThis.Cc = { "@mozilla.org/security/oskeystore;1": { getService: () => ks } };
globalThis.PathUtils = { profileDir: "/prof", join: (...a) => a.join("/") };
globalThis.IOUtils = {
  async exists(p) { return files.has(p) || dirs.has(p); },
  async readJSON(p) { return JSON.parse(new TextDecoder().decode(files.get(p).bytes)); },
  async write(p, bytes) { files.set(p, { bytes: Uint8Array.from(bytes), mode: 0o644 }); return bytes.length; },
  async setPermissions(p, m) { if (files.has(p)) files.get(p).mode = m; else if (dirs.has(p)) dirs.set(p, m); },
  async move(a, b) { files.set(b, files.get(a)); files.delete(a); },
  async remove(p) { files.delete(p); },
  async makeDirectory(p, o) { if (!dirs.has(p)) dirs.set(p, o?.permissions ?? 0o755); },
};
globalThis.ChromeUtils = {
  importESModule(uri) {
    if (uri.includes("AsyncShutdown")) return { AsyncShutdown: { profileBeforeChange: { addBlocker: (_n, fn) => (globalThis.__blocker = fn) } } };
    throw new Error("no module in node: " + uri);
  },
  originAttributesToSuffix: () => "",
  registerWindowActor() {}, unregisterWindowActor() {},
};
globalThis.JSWindowActorParent = class {};
globalThis.JSWindowActorChild = class {};

const FW = await import(pathToFileURL(FW_PATH).href);
const { DarkstrCookieFirewall: fw, DarkstrCookieJarStore: store, DarkstrCookieFirewallCleaner: cleaner } = FW;
const JAR = "/prof/darkstr/cookie-jar.json";
const DAY = 86400000;

function keep(host) { perms.push({ type: "persist-data-on-shutdown", host, capability: 1 }); }
function unkeep(host) {
  const i = perms.findIndex((p) => p.type === "persist-data-on-shutdown" && p.host === host); perms.splice(i, 1);
  for (const o of observers.get("perm-changed") || []) o.observe({ type: "persist-data-on-shutdown" }, "perm-changed", "deleted");
}
const rec = (name, value, host, extra = {}) => ({ name, value, host, hostOnly: true, path: "/", secure: true, httpOnly: false, sameSite: "lax", partitioned: false, expiry: Date.now() + 30 * DAY, creation: 1, ctime: Date.now() * 1000, ...extra });
const ck = (r) => `${r.name}\u0000${r.host}\u0000${r.path}`;
function put(bucketKey, r) {
  fw._bucket(bucketKey, true).set(ck(r), r);
  store.noteChange(bucketKey);
}
function armPrefs() {
  prefs.set("darkstr.mode", "pollution"); prefs.set("darkstr.nativePersonaHooks", true); prefs.set("darkstr.cookieFirewall.enabled", true);
  prefs.set("darkstr.cookieFirewall.mode", "isolate");
}
async function boot() {
  // a fresh browser process: memory gone, profile + Keychain stay
  fw._inited = false; fw._armed = false; fw._jar = new Map(); fw._lastMode = undefined;
  store._resetForTests(); store._observing = false; observers.clear();
  fw.init(); await store.whenReady(); await Promise.resolve();
}
async function quit() { await globalThis.__blocker(); }
function reset() { prefs.clear(); files.clear(); dirs.clear(); secrets.clear(); perms.length = 0; }
const fileText = () => new TextDecoder().decode(files.get(JAR)?.bytes || new Uint8Array());

const A0 = "0.0|https://kept.test", A2 = "2.0|https://kept.test", AP = "0.1|https://kept.test", B0 = "0.0|https://gone.test";
const A0p = "0.0|https://kept.test|p";

test("0060r2: a kept site's sandbox cookies survive a restart; non-kept and private never reach disk", async () => {
  reset(); armPrefs(); keep("kept.test"); await boot();
  assert.equal(store.debugState().hydrated, true);
  put(A0, rec("sid", "SECRETVALUE-A", "kept.test"));
  put(A0p, rec("tp", "SECRETVALUE-3P", "tracker.example", { partitioned: true }));
  put(B0, rec("sid", "SECRETVALUE-B", "gone.test"));
  put(AP, rec("pv", "SECRETVALUE-PRIV", "kept.test"));
  await quit();
  assert.equal(files.get(JAR).mode, 0o600, "file 0600");
  assert.equal(dirs.get("/prof/darkstr"), 0o700, "dir 0700");
  const t = fileText();
  for (const s of ["kept.test", "gone.test", "tracker.example", "SECRETVALUE", "sid", "https", "0.0|", "\"b\"", "\"r\""]) assert.ok(!t.includes(s), `no plaintext ${s}`);
  const label = JSON.parse(t).l;
  assert.match(label, /^darkstr-cookie-jar-[0-9a-f]{16}$/); assert.ok(secrets.has(label), "key held in the Keychain");
  assert.equal(JSON.parse(t).e.length, 2, "kept first-party + kept partition only");
  await boot();
  assert.equal(fw._bucket(A0, false)?.get("sid\u0000kept.test\u0000/")?.value, "SECRETVALUE-A", "restored");
  assert.equal(fw._bucket(A0p, false)?.size, 1, "kept site's partition restored");
  assert.equal(fw._bucket(B0, false), null, "non-kept gone");
  assert.equal(fw._bucket(AP, false), null, "private never persisted");
});

test("0060r2: containers stay separated, with per-context HMAC tags; a swapped entry is rejected", async () => {
  reset(); armPrefs(); keep("kept.test"); await boot();
  put(A0, rec("sid", "V0", "kept.test")); put(A2, rec("sid", "V2", "kept.test"));
  await quit();
  const e = JSON.parse(fileText()).e;
  assert.equal(e.length, 2); assert.notEqual(e[0].c, e[1].c, "context tags differ"); assert.notEqual(e[0].h, e[1].h);
  await boot();
  assert.equal(fw._bucket(A0, false).get("sid\u0000kept.test\u0000/").value, "V0");
  assert.equal(fw._bucket(A2, false).get("sid\u0000kept.test\u0000/").value, "V2", "container 2 restored into container 2");
  // tamper: swap the context tags -> AES-GCM AAD / tag check rejects both
  const obj = JSON.parse(fileText()); [obj.e[0].c, obj.e[1].c] = [obj.e[1].c, obj.e[0].c];
  files.set(JAR, { bytes: new TextEncoder().encode(JSON.stringify(obj)), mode: 0o600 });
  await boot();
  assert.equal(fw._bucket(A0, false), null); assert.equal(fw._bucket(A2, false), null);
  assert.equal(store.debugState().stats.decryptErrors, 2);
});

test("0060r2: unkeep, per-site clear, container removal, range and clear-all remove persisted cookies", async () => {
  reset(); armPrefs(); keep("kept.test"); keep("other.test"); await boot();
  put(A0, rec("sid", "V0", "kept.test")); put(A2, rec("sid", "V2", "kept.test"));
  put("0.0|https://other.test", rec("o", "VO", "other.test"));
  await store.flush(true);
  assert.equal(JSON.parse(fileText()).e.length, 3);
  // container removal: only container 2
  await cleaner.deleteByOriginAttributes(JSON.stringify({ userContextId: 2 }));
  assert.equal(JSON.parse(fileText()).e.length, 2);
  // per-site clear (Forget About This Site)
  await cleaner.deleteBySite("other.test", {});
  assert.equal(JSON.parse(fileText()).e.length, 1);
  // unkeep prunes at once
  unkeep("kept.test"); await new Promise((r) => setTimeout(r, 700));
  assert.equal(files.has(JAR), false, "nothing kept -> no file");
  // range clear while disarmed reaches the file
  keep("kept.test"); put(A0, rec("sid", "V0", "kept.test")); await store.flush(true);
  prefs.set("darkstr.cookieFirewall.enabled", false); fw.refreshPlan();
  assert.equal(fw._armed, false); assert.equal(JSON.parse(fileText()).e.length, 1, "disarm keeps the kept jar");
  await cleaner.deleteByRange(0, Date.now() * 1000);
  assert.equal(files.has(JAR), false, "range clear reached the persisted jar while disarmed");
  // clear-all: file and Keychain secret
  prefs.set("darkstr.cookieFirewall.enabled", true); fw.refreshPlan(); await store.whenReady();
  put(A0, rec("sid", "V0", "kept.test")); await store.flush(true);
  const label = JSON.parse(fileText()).l;
  await cleaner.deleteAll();
  assert.equal(files.has(JAR), false); assert.equal(secrets.has(label), false, "secret deleted");
  put(A0, rec("sid", "V1", "kept.test")); await store.flush(true);
  assert.notEqual(JSON.parse(fileText()).l, label, "next store: new key and label");
});

test("0060r2: kill -9 safety -- atomic replace, stray tmp removed, garbage file recovered without plaintext", async () => {
  reset(); armPrefs(); keep("kept.test"); await boot();
  put(A0, rec("sid", "V0", "kept.test")); await store.flush(true);
  const good = files.get(JAR);
  // killed mid-write: a .tmp exists, the real file is the previous version
  files.set(JAR + ".tmp", { bytes: new TextEncoder().encode("{\"v\":1,\"trunc"), mode: 0o600 });
  await boot();
  assert.equal(files.has(JAR + ".tmp"), false, "stray tmp removed");
  assert.equal(fw._bucket(A0, false).get("sid\u0000kept.test\u0000/").value, "V0", "previous version intact");
  assert.equal(files.get(JAR), good);
  // a torn / garbage file (e.g. disk error): starts empty, replaced at next save
  files.set(JAR, { bytes: new TextEncoder().encode("\u0000\u0001garbage"), mode: 0o600 });
  await boot();
  assert.equal(fw._bucket(A0, false), null);
  put(A0, rec("sid", "V9", "kept.test")); await store.flush(true);
  assert.doesNotThrow(() => JSON.parse(fileText())); assert.ok(!fileText().includes("V9"));
  // write path is tmp + chmod 0600 + rename
  const src = readFileSync(FW_PATH, "utf8");
  assert.match(src, /const tmp = this\.path \+ "\.tmp";\s*await IOUtils\.write\(tmp,[^;]*flush: true \}\);\s*await IOUtils\.setPermissions\(tmp, 0o600\);\s*await IOUtils\.move\(tmp, this\.path/);
});

test("0060r2: only cookies a stock restart keeps -- expired never, session cookies only with session restore; mode switch forgets", async () => {
  reset(); armPrefs(); keep("kept.test"); await boot();
  put(A0, rec("p", "P", "kept.test")); put(A0, rec("s", "S", "kept.test", { expiry: null })); put(A0, rec("x", "X", "kept.test", { expiry: Date.now() - 1 }));
  await quit(); await boot();
  assert.deepEqual([...fw._bucket(A0, false).values()].map((r) => r.name), ["p"]);
  prefs.set("browser.startup.page", 3); put(A0, rec("s", "S", "kept.test", { expiry: null }));
  await quit(); await boot();
  assert.deepEqual([...fw._bucket(A0, false).values()].map((r) => r.name).sort(), ["p", "s"]);
  prefs.set("darkstr.cookieFirewall.mode", "synthetic"); fw.refreshPlan(); await store.flush(true);
  assert.equal(files.has(JAR), false, "isolate values are not reused under synthetic");
});

test("0060r2: firewall off = stock -- the store never loads, creates a file or a Keychain item", async () => {
  reset(); keep("kept.test"); await boot();
  assert.equal(fw._armed, false); assert.equal(store.debugState().state, "idle");
  await quit();
  assert.equal(files.size, 0); assert.equal(secrets.size, 0);
});

test("0060r2: startup hold -- a kept site's request waits for the load and then carries the persisted cookie", async () => {
  reset(); armPrefs(); keep("kept.test"); await boot();
  put(A0, rec("sid", "V0", "kept.test")); await quit();
  // next process, load still in flight
  fw._inited = false; fw._armed = false; fw._jar = new Map(); store._resetForTests(); store._observing = false;
  fw.init();
  assert.equal(store.loading, true);
  const hdr = {}; let suspended = 0, resumed = 0;
  const channel = { suspend: () => suspended++, resume: () => resumed++, setRequestHeader: (k, v) => (hdr[k] = v), getRequestHeader: (k) => hdr[k] };
  const ctx = { top: { base: "kept.test", scheme: "https" }, oa: {}, readKeys: [A0], req: { host: "kept.test", path: "/" }, secure: true, crossSite: false, topLevelNav: true, safeMethod: true };
  assert.equal(fw._holdForJarStore(channel, ctx, fw._env({})), true);
  assert.equal(suspended, 1); assert.equal(resumed, 0);
  await store.whenReady(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(resumed, 1); assert.equal(hdr.Cookie, "sid=V0");
  // non-kept / private never wait
  store._state = "loading";
  assert.equal(fw._holdForJarStore(channel, { ...ctx, top: { base: "gone.test" } }, fw._env({})), false);
  assert.equal(fw._holdForJarStore(channel, { ...ctx, oa: { privateBrowsingId: 1 } }, fw._env({ privateBrowsingId: 1 })), false);
  store._state = "ready";
});
