/**
 * 0056: persisted per-site persona seeds (DarkstrPersonaSeedStore).
 * Offline: Gecko services are mocked (IOUtils in-memory FS with modes,
 * OSKeyStore, nsICryptoHash via node:crypto, permissions, prefs).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash, createHmac, randomBytes as nodeRandom } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(root, "patches", "0056-files");

// ---------------------------------------------------------------- mocks ---
const prefs = new Map();
const perms = []; // { type, capability, host }
const fs = new Map(); // path -> { bytes, mode }
const dirs = new Map(); // path -> mode
const ops = [];
const keystore = { secrets: new Map(), fail: false, calls: [] };
let flushed = 0;

const binStr = (buf) => String.fromCharCode(...buf);
globalThis.Ci = {
  nsIXULRuntime: { PROCESS_TYPE_DEFAULT: 0 },
  nsICryptoHash: { SHA256: 4 },
  nsIPermissionManager: { ALLOW_ACTION: 1 },
  nsICookiePermission: { ACCESS_SESSION: 8 },
  nsIRandomGenerator: {}, nsIOSKeyStore: {},
};
globalThis.Cc = {
  "@mozilla.org/security/random-generator;1": { getService: () => ({ generateRandomBytes: (n) => Array.from(nodeRandom(n)) }) },
  "@mozilla.org/security/hash;1": {
    createInstance: () => {
      const parts = [];
      return { init() {}, update(a, n) { parts.push(Buffer.from(a.slice(0, n))); }, finish: () => binStr(createHash("sha256").update(Buffer.concat(parts)).digest()) };
    },
  },
  "@mozilla.org/security/oskeystore;1": {
    getService: () => ({
      async asyncGenerateSecret(l) { keystore.calls.push(["gen", l]); if (keystore.fail) throw new Error("NS_ERROR_FAILURE"); keystore.secrets.set(l, nodeRandom(32)); return "phrase"; },
      async asyncSecretAvailable(l) { keystore.calls.push(["avail", l]); if (keystore.fail) throw new Error("NS_ERROR_FAILURE"); return keystore.secrets.has(l); },
      async asyncEncryptBytes(l, bytes) { const s = keystore.secrets.get(l); if (!s) throw new Error("no secret"); return Buffer.from(bytes.map((b, i) => b ^ s[i % 32])).toString("base64"); },
      async asyncDecryptBytes(l, b64) { const s = keystore.secrets.get(l); if (!s) throw new Error("no secret"); return Array.from(Buffer.from(b64, "base64")).map((b, i) => b ^ s[i % 32]); },
      async asyncDeleteSecret(l) { keystore.calls.push(["del", l]); keystore.secrets.delete(l); },
    }),
  },
};
const base = (h) => h.split(".").slice(-2).join(".");
globalThis.Services = {
  appinfo: { processType: 0 },
  prefs: { getBoolPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d), getIntPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d) },
  eTLD: { getBaseDomainFromHost: base },
  perms: { getAllByTypes: (types) => perms.filter((p) => types.includes(p.type)).map((p) => ({ capability: p.capability, principal: { host: p.host } })) },
  obs: { addObserver() {} },
};
globalThis.PathUtils = { profileDir: "/prof", join: (...a) => a.join("/") };
globalThis.IOUtils = {
  async exists(p) { return fs.has(p) || dirs.has(p); },
  async readJSON(p) { ops.push(["read", p]); return JSON.parse(Buffer.from(fs.get(p).bytes).toString()); },
  async makeDirectory(p, o) { ops.push(["mkdir", p, o.permissions]); if (!dirs.has(p)) dirs.set(p, o.permissions); },
  async setPermissions(p, m) { ops.push(["chmod", p, m]); if (fs.has(p)) fs.get(p).mode = m; else dirs.set(p, m); },
  async write(p, bytes) { ops.push(["write", p]); fs.set(p, { bytes: Buffer.from(bytes), mode: 0o644 }); },
  async move(a, b) { ops.push(["move", a, b]); fs.set(b, fs.get(a)); fs.delete(a); },
  async remove(p) { ops.push(["remove", p]); fs.delete(p); },
};
globalThis.ChromeUtils = { importESModule: () => ({ AsyncShutdown: { profileBeforeChange: { addBlocker() {} } } }) };

const src = readFileSync(join(F, "DarkstrPersonaSeedStore.sys.mjs"), "utf8").replace(
  /^import \{ setTimeout, clearTimeout \} from "resource:\/\/gre\/modules\/Timer\.sys\.mjs";$/m,
  "const { setTimeout, clearTimeout } = globalThis;"
);
assert.ok(!src.includes("Timer.sys.mjs"), "timer import replaced");
const tmp = join(mkdtempSync(join(tmpdir(), "ds56-")), "store.mjs");
writeFileSync(tmp, src);
const M = await import(pathToFileURL(tmp));
const S = M.DarkstrPersonaSeedStore;
const CL = M.DarkstrPersonaSeedCleaner;
S.addFlushListener(() => flushed++);

const FILE = "/prof/darkstr/persona-seeds.json";
const fileText = () => Buffer.from(fs.get(FILE).bytes).toString();
const fileJSON = () => JSON.parse(fileText());
async function restart() { S._resetForTests(); S.activate(); await S.whenReady(); }
function lwDefaults() {
  prefs.clear();
  prefs.set("privacy.sanitize.sanitizeOnShutdown", true);
  prefs.set("privacy.clearOnShutdown_v2.cookiesAndStorage", true);
}
const hm = (m) => createHmac("sha256", Buffer.from(S._key)).update(m).digest("hex");
function wipe() { fs.clear(); dirs.clear(); ops.length = 0; keystore.secrets.clear(); keystore.calls.length = 0; keystore.fail = false; perms.length = 0; S._resetForTests(); }

test("HMAC-SHA256 matches RFC 2104 (node:crypto)", () => {
  const key = Array.from(nodeRandom(32));
  for (const m of ["a56.test", "example.co.uk", ""]) {
    assert.equal(M.hmacSha256Hex(key, m), createHmac("sha256", Buffer.from(key)).update(m).digest("hex"));
  }
});

test("context keys and origin-attribute patterns", () => {
  assert.equal(M.contextKeyFromOA({ userContextId: 0, privateBrowsingId: 0 }), "0");
  assert.equal(M.contextKeyFromOA({ userContextId: 3 }), "3");
  assert.equal(M.contextKeyFromOA({ userContextId: 0, privateBrowsingId: 1 }), "p");
  const all = M.contextFilterFromPattern({});
  assert.ok(all("0") && all("3") && all("p"));
  const c3 = M.contextFilterFromPattern('{"userContextId":3}');
  assert.ok(c3("3") && !c3("0") && !c3("p"));
  const pb = M.contextFilterFromPattern({ privateBrowsingId: 1 });
  assert.ok(pb("p") && !pb("0") && !pb("3"));
  const npb = M.contextFilterFromPattern({ privateBrowsingId: 0 });
  assert.ok(!npb("p") && npb("0") && npb("3"));
});

test("keep list: only persist-data-on-shutdown sites are written (LibreWolf clear-on-shutdown)", async () => {
  wipe(); lwDefaults();
  perms.push({ type: "persist-data-on-shutdown", capability: 1, host: "www.a56.test" });
  await restart();
  const a = S.seedFor("0", "a56.test");
  const b = S.seedFor("0", "b56.test");
  await S.flush();
  const j = fileJSON();
  assert.equal(j.v, 2);
  assert.equal(j.e.length, 1);
  assert.deepEqual(Object.keys(j.e[0]).sort(), ["c", "h", "s"], "0056r3: no first-seen time");
  assert.equal(j.e[0].c, hm("ctx:0"), "context is an HMAC, not plaintext");
  assert.equal(j.e[0].s, a);
  assert.equal(j.e[0].h, hm("0|a56.test"), "site hash is per context");
  assert.ok(!/a56\.test|b56\.test|\.test\b/.test(fileText()), "no site names in the file");
  assert.equal(fs.get(FILE).mode, 0o600);
  assert.equal(dirs.get("/prof/darkstr"), 0o700);
  // atomic: tmp written, chmod 0600 before the rename
  const w = ops.findIndex((o) => o[0] === "write" && o[1] === FILE + ".tmp");
  const c = ops.findIndex((o, i) => i > w && o[0] === "chmod" && o[1] === FILE + ".tmp" && o[2] === 0o600);
  const mv = ops.findIndex((o, i) => i > c && o[0] === "move" && o[1] === FILE + ".tmp" && o[2] === FILE);
  assert.ok(w >= 0 && c > w && mv > c, JSON.stringify(ops));
  assert.ok(!ops.some((o) => o[0] === "write" && o[1] === FILE), "never written in place");
  // restart: A survives, B resets
  await restart();
  assert.equal(S.seedFor("0", "a56.test"), a);
  assert.notEqual(S.seedFor("0", "b56.test"), b);
});

test("container and private personas differ; private never written", async () => {
  wipe(); prefs.clear(); // no clear-on-shutdown: every non-private site is kept
  await restart();
  const n = S.seedFor("0", "a56.test"), c = S.seedFor("2", "a56.test"), p = S.seedFor("p", "a56.test");
  assert.equal(new Set([n, c, p]).size, 3);
  await S.flush();
  const j = fileJSON();
  assert.deepEqual(j.e.map((e) => e.c).sort(), [hm("ctx:0"), hm("ctx:2")].sort());
  assert.ok(!j.e.some((e) => e.c === "p" || /^\d+$/.test(e.c)), "no plaintext container numbers");
  // 0056r3: the same site is not linkable across contexts from the file alone
  assert.equal(new Set(j.e.map((e) => e.h)).size, 2);
  assert.ok(!j.e.some((e) => e.h === hm("a56.test")));
  await restart();
  assert.equal(S.seedFor("2", "a56.test"), c);
  assert.notEqual(S.seedFor("p", "a56.test"), p, "private is memory-only");
  S.observe(null, "last-pb-context-exited");
  assert.equal(S.debugState().sessionPrivate, 0);
});

test("cookie ACCESS_SESSION wins over everything", async () => {
  wipe(); prefs.clear();
  perms.push({ type: "persist-data-on-shutdown", capability: 1, host: "a56.test" }, { type: "cookie", capability: 8, host: "a56.test" });
  await restart();
  S.seedFor("0", "a56.test"); S.seedFor("0", "c56.test");
  await S.flush();
  assert.equal(fileJSON().e.length, 1);
  assert.notEqual(fileJSON().e[0].h, hm("0|a56.test"));
  assert.equal(fileJSON().e[0].h, hm("0|c56.test"));
});

test("site clear (incl. subdomain host) resets only that site; pattern scopes contexts", async () => {
  wipe(); prefs.clear();
  await restart();
  const a0 = S.seedFor("0", "a56.test"), a1 = S.seedFor("1", "a56.test"), b0 = S.seedFor("0", "b56.test");
  await S.flush();
  flushed = 0;
  await CL.deleteByHost("deep.sub.a56.test", { userContextId: 1 });
  assert.ok(flushed > 0, "in-memory copies flushed");
  assert.equal(fileJSON().e.length, 2);
  assert.equal(S.seedFor("0", "a56.test"), a0);
  assert.notEqual(S.seedFor("1", "a56.test"), a1);
  await CL.deleteBySite("a56.test", {});
  await restart();
  assert.notEqual(S.seedFor("0", "a56.test"), a0);
  assert.equal(S.seedFor("0", "b56.test"), b0);
});

test("container deletion (origin-attributes pattern) and principal clear", async () => {
  wipe(); prefs.clear();
  await restart();
  const a0 = S.seedFor("0", "a56.test"); S.seedFor("4", "a56.test"); S.seedFor("4", "b56.test");
  await S.flush();
  await CL.deleteByOriginAttributes('{"userContextId":4}');
  assert.deepEqual(fileJSON().e.map((e) => e.c), [hm("ctx:0")]);
  await CL.deleteByPrincipal({ host: "a56.test", originAttributes: { userContextId: 0 } });
  assert.equal(fileJSON().e.length, 0);
  assert.notEqual(S.seedFor("0", "a56.test"), a0);
});

test("0056r3: any time-range clear resets every non-private seed in every context (key kept)", async () => {
  wipe(); prefs.clear();
  await restart();
  const a0 = S.seedFor("0", "a56.test"), b3 = S.seedFor("3", "b56.test"), p = S.seedFor("p", "a56.test");
  await S.flush();
  const label = fileJSON().l;
  const seen = [];
  const listener = (pred) => { seen.push(pred); };
  S.addFlushListener(listener);
  const nowUs = Date.now() * 1000;
  await CL.deleteByRange(nowUs - 3600e6, nowUs); // "last hour"
  S.removeFlushListener(listener);
  assert.equal(fileJSON().e.length, 0);
  assert.equal(fileJSON().l, label, "range clear keeps the key (only clear-all rotates)");
  assert.notEqual(S.seedFor("0", "a56.test"), a0);
  assert.notEqual(S.seedFor("3", "b56.test"), b3);
  assert.equal(S.seedFor("p", "a56.test"), p, "private untouched by a range clear");
  // listeners get a (ctx, site) predicate that works with two arguments
  const pred = seen.at(-1);
  assert.equal(typeof pred, "function");
  assert.equal(pred("0", "a56.test"), true);
  assert.equal(pred("7", "zz.test"), true);
  assert.equal(pred("p", "a56.test"), false);
  assert.equal(S.debugState().stats.flushErrors, 0);
});

test("0056r3 regression (Proof #87 check 2f): range clear flushes NativePersona's caches", async () => {
  // NativePersona._flushSeedCopies, lifted from the shipped source, wired as a real listener.
  const NPsrc = readFileSync(join(F, "DarkstrNativePersona.sys.mjs"), "utf8");
  const at = NPsrc.indexOf("  _flushSeedCopies(pred) {");
  const body = NPsrc.slice(at, NPsrc.indexOf("\n  },\n", at) + 4);
  let dhFlushes = 0;
  const fake = new Function("ChromeUtils", `return { ${body}, _etldSeedMap: new Map(), _etldSnapshotCache: new Map(), _workerSiteDecisions: new Map() };`)(
    { importESModule: () => ({ DarkstrDepthHooks: { flushSeedCopies() { dhFlushes++; } } }) });
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test"); S.seedFor("1", "b56.test"); S.seedFor("p", "c56.test");
  for (const k of ["0|a56.test", "1|b56.test", "p|c56.test"]) { fake._etldSeedMap.set(k, 1); fake._etldSnapshotCache.set(k, {}); }
  const listener = (pred) => fake._flushSeedCopies(pred);
  S.addFlushListener(listener);
  try {
    await CL.deleteByRange(0, Date.now() * 1000);
  } finally { S.removeFlushListener(listener); }
  assert.equal(S.debugState().stats.flushErrors, 0, S.debugState().lastFlushError);
  assert.deepEqual([...fake._etldSnapshotCache.keys()], ["p|c56.test"], "every non-private snapshot dropped");
  assert.deepEqual([...fake._etldSeedMap.keys()], ["p|c56.test"]);
  assert.ok(dhFlushes >= 1, "DepthHooks copies flushed too");
});

test("0056r3: a failing flush listener is logged and counted, never silent", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test");
  const bad = () => { throw new Error("boom-0056r3"); };
  S.addFlushListener(bad);
  const origErr = console.error; console.error = () => {};
  try { await CL.deleteBySite("a56.test", {}); } finally { console.error = origErr; S.removeFlushListener(bad); }
  assert.equal(S.debugState().stats.flushErrors, 1);
  assert.match(S.debugState().lastFlushError, /boom-0056r3/);
});

test("0056r3: v1 files migrate on use, then the rest is wiped once", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "z56.test"); await S.flush(); // creates key + label
  const key = S._key, label = fileJSON().l, cipher = fileJSON().k;
  const v1h = (site) => createHmac("sha256", Buffer.from(key)).update(site).digest("hex");
  fs.set(FILE, { bytes: Buffer.from(JSON.stringify({ v: 1, l: label, k: cipher, e: [
    { c: "0", h: v1h("a56.test"), s: 111, t: 20000 }, { c: "2", h: v1h("a56.test"), s: 222, t: 20000 }, { c: "0", h: v1h("b56.test"), s: 333, t: 20000 }] })), mode: 0o600 });
  await restart();
  assert.equal(S.debugState().legacy, 3);
  assert.equal(S.seedFor("0", "a56.test"), 111, "v1 seed adopted");
  assert.equal(S.seedFor("2", "a56.test"), 222);
  await S.flush();
  const j = fileJSON();
  assert.equal(j.v, 2);
  assert.equal(j.l, label);
  assert.deepEqual(j.e.map((e) => e.s).sort(), [111, 222]);
  assert.ok(j.e.every((e) => Object.keys(e).sort().join() === "c,h,s" && e.c.length === 64));
  assert.equal(S.debugState().stats.migratedV1, 2);
  await restart();
  assert.equal(S.seedFor("0", "a56.test"), 111);
  assert.notEqual(S.seedFor("0", "b56.test"), 333, "unused v1 entries are gone after the first v2 write");
});

test("0056r3: container deletion and site clears find hashed contexts", async () => {
  wipe(); prefs.clear();
  await restart();
  const a0 = S.seedFor("0", "a56.test"), a5 = S.seedFor("5", "a56.test"), b5 = S.seedFor("5", "b56.test");
  await S.flush();
  await restart(); // fresh session: contexts only known from the file
  await CL.deleteBySite("a56.test", {}); // all contexts
  assert.equal(fileJSON().e.length, 1);
  assert.equal(fileJSON().e[0].c, hm("ctx:5"));
  assert.equal(S.seedFor("5", "b56.test"), b5);
  await restart();
  await CL.deleteByOriginAttributes('{"userContextId":5}');
  assert.equal(fileJSON().e.length, 0);
  assert.notEqual(S.seedFor("0", "a56.test"), a0);
  assert.notEqual(S.seedFor("5", "a56.test"), a5);
});

test("clear all deletes file and OSKeyStore secret; next store gets a new key", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test");
  await S.flush();
  const label = fileJSON().l;
  await CL.deleteAll();
  assert.ok(!fs.has(FILE));
  assert.ok(!keystore.secrets.has(label));
  assert.ok(keystore.calls.some((c) => c[0] === "del" && c[1] === label));
  S.seedFor("0", "a56.test");
  await S.flush();
  assert.notEqual(fileJSON().l, label);
});

test("OSKeyStore unavailable -> session-only, nothing written", async () => {
  wipe(); prefs.clear();
  keystore.fail = true;
  await restart();
  const a = S.seedFor("0", "a56.test");
  await S.flush();
  assert.equal(S.seedFor("0", "a56.test"), a);
  assert.ok(!fs.has(FILE));
  assert.equal(S.debugState().state, "session-only");
  wipe(); prefs.clear(); prefs.set("darkstr.persona.seedStore.osKeyStore", false);
  await restart();
  S.seedFor("0", "a56.test");
  await S.flush();
  assert.ok(!fs.has(FILE));
  assert.equal(keystore.calls.length, 0);
});

test("not activated (off mode): a cleaner never creates a store", async () => {
  wipe(); prefs.clear();
  await CL.deleteBySite("a56.test", {});
  await CL.deleteByRange(0, Date.now() * 1000);
  await CL.deleteAll();
  assert.equal(fs.size, 0);
  assert.ok(!ops.some((o) => o[0] === "write" || o[0] === "mkdir"));
});

test("seeds handed out while loading: a stored seed wins after load", async () => {
  wipe(); prefs.clear();
  await restart();
  const a = S.seedFor("0", "a56.test");
  await S.flush();
  S._resetForTests();
  S.activate(); // loading
  const early = S.seedFor("0", "a56.test");
  await S.whenReady();
  assert.equal(S.seedFor("0", "a56.test"), a);
  assert.ok(early === a || flushed > 0);
});

// ------------------------------------------------------------ wiring ---
const NP = readFileSync(join(F, "DarkstrNativePersona.sys.mjs"), "utf8");
const CDS = readFileSync(join(F, "ClearDataService.sys.mjs"), "utf8");
test("wiring: fixed test seed bypasses the store; per-context everywhere; cleaner registered", () => {
  assert.match(NP, /if \(!this\._fixedSeedSet\(\)\) \{\n\s+const store = this\._activateSeedStore\(\);/);
  assert.match(NP, /if \(rotateWanted && !this\._fixedSeedSet\(\)\) \{\n\s+this\._activateSeedStore\(\);/);
  assert.match(CDS, /cleaners: \[FingerprintingProtectionStateCleaner, DarkstrPersonaSeedCleaner\]/);
  for (const m of ["deleteAll", "deleteByPrincipal", "deleteBySite", "deleteByHost", "deleteByRange", "deleteByOriginAttributes"]) {
    assert.ok(CDS.includes(`async ${m}(`), m);
  }
  const cpp = readFileSync(join(F, "DarkstrNavigatorHooks.cpp"), "utf8");
  assert.ok(cpp.includes('u"userContextId"_ns') && cpp.includes('u"privateBrowsingId"_ns'));
  const s = readFileSync(join(F, "DarkstrPersonaSeedStore.sys.mjs"), "utf8");
  assert.ok(s.includes('throw new Error("darkstr 0056: persona seed store is parent-only")'));
});

test("a clear on a passive (off-mode) store with nothing matching never rewrites it", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test");
  await S.flush();
  const before = fileText();
  S._resetForTests(); ops.length = 0; // new session, never armed
  await CL.deleteBySite("zz56.test", {});
  await CL.deleteByOriginAttributes('{"userContextId":9}');
  assert.equal(fileText(), before);
  assert.ok(!ops.some((o) => o[0] === "write" || o[0] === "move"), JSON.stringify(ops));
  await CL.deleteBySite("a56.test", {}); // a real hit is removed even off
  assert.equal(fileJSON().e.length, 0);
});

// ------------------------------------------------- 0056r2 startup hold ---
test("store.loading is true only while the file/key load runs", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test");
  await S.flush();
  S._resetForTests();
  assert.equal(S.loading, false);
  S.activate();
  assert.equal(S.loading, true);
  await S.whenReady();
  assert.equal(S.loading, false);
});

test("0056r2: top-level loads are held while the store loads, decided after ready (or timeout), never for private/fixed seed", async () => {
  const { DarkstrNativePersona: NPM } = await import(pathToFileURL(join(F, "DarkstrNativePersona.sys.mjs")));
  const realImport = globalThis.ChromeUtils.importESModule;
  const timers = [];
  let resolveReady;
  const fakeStore = { loading: true, whenReady: () => new Promise((r) => { resolveReady = r; }) };
  globalThis.ChromeUtils.importESModule = (u) =>
    u.includes("Timer.sys.mjs")
      ? { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (id) => { timers[id - 1].cleared = true; } }
      : u.includes("DarkstrPersonaSeedStore") ? { DarkstrPersonaSeedStore: fakeStore } : realImport(u);
  globalThis.Ci = Object.assign(globalThis.Ci || {}, { nsIContentPolicy: { TYPE_DOCUMENT: 6 } });
  const mkChan = (pb = 0) => {
    const c = { log: [], loadInfo: { externalContentPolicyType: 6, originAttributes: { privateBrowsingId: pb, userContextId: 0 } } };
    c.suspend = () => c.log.push("suspend"); c.resume = () => c.log.push("resume");
    return c;
  };
  const self = Object.create(NPM);
  const applied = [];
  self._applyChannelPersona = (ch) => { applied.push(ch); ch.log.push("apply"); };
  self._rotationActive = () => true;
  let fixed = false;
  self._fixedSeedSet = () => fixed;
  self._seedHoldStats = null;
  try {
    // held, then released by store ready: apply happens before resume
    const c1 = mkChan();
    assert.equal(self._holdForSeedStore(c1, {}), true);
    assert.deepEqual(c1.log, ["suspend"]);
    assert.equal(timers[0].ms, 2000);
    resolveReady(); await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(c1.log, ["suspend", "apply", "resume"]);
    assert.ok(timers[0].cleared);
    // timeout path: decided and resumed exactly once even if ready comes later
    const c2 = mkChan();
    assert.equal(self._holdForSeedStore(c2, {}), true);
    timers[1].fn();
    resolveReady(); await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(c2.log, ["suspend", "apply", "resume"]);
    assert.deepEqual(self._seedHoldStats, { held: 2, ready: 1, timeout: 1 });
    // private browsing, fixed test seed, store ready, not a document: never held
    assert.equal(self._holdForSeedStore(mkChan(1), {}), false);
    fixed = true; assert.equal(self._holdForSeedStore(mkChan(), {}), false); fixed = false;
    fakeStore.loading = false; assert.equal(self._holdForSeedStore(mkChan(), {}), false); fakeStore.loading = true;
    const sub = mkChan(); sub.loadInfo.externalContentPolicyType = 2;
    assert.equal(self._holdForSeedStore(sub, {}), false);
    self._rotationActive = () => false; assert.equal(self._holdForSeedStore(mkChan(), {}), false);
  } finally {
    globalThis.ChromeUtils.importESModule = realImport;
  }
  assert.match(NP, /if \(this\._holdForSeedStore\(channel, plan\)\) \{\n\s+return;\n\s+\}\n\s+this\._applyChannelPersona\(channel\);/);
});

test("0056r4: a partitioned clear never resets a kept site's seed (shutdown sanitizer, A framed under non-kept B)", async () => {
  wipe(); lwDefaults();
  perms.push({ type: "persist-data-on-shutdown", capability: 1, host: "a56.test" });
  await restart();
  const a = S.seedFor("0", "a56.test");
  S.seedFor("0", "b56.test");
  await S.flush();
  assert.equal(fileJSON().e.length, 1);
  // What Sanitizer's maybeSanitizeSessionPrincipals hands the cleaner for A's data partitioned under B
  // (partitionKey site b56.test has no exception), plus the partition patterns ClearDataService may use.
  await CL.deleteByPrincipal({ host: "a56.test", originAttributes: { userContextId: 0, partitionKey: "(http,b56.test)" } });
  await CL.deleteByHost("a56.test", { partitionKey: "(http,b56.test)" });
  await CL.deleteBySite("a56.test", '{"partitionKey":"(http,b56.test)"}');
  await CL.deleteByOriginAttributes('{"partitionKeyPattern":{"baseDomain":"b56.test"}}');
  assert.equal(fileJSON().e.length, 1, "kept entry still on disk");
  assert.equal(fileJSON().e[0].s, a);
  assert.equal(S.seedFor("0", "a56.test"), a, "in-session seed unchanged");
  await restart();
  assert.equal(S.seedFor("0", "a56.test"), a, "kept site keeps its persona across the restart");
  // A's own first-party principal (no partition) still clears it, as before.
  await CL.deleteByPrincipal({ host: "a56.test", originAttributes: { userContextId: 0, partitionKey: "" } });
  assert.notEqual(S.seedFor("0", "a56.test"), a);
});

test("0056r4: isPartitioned", () => {
  assert.equal(M.isPartitioned({ userContextId: 0, partitionKey: "" }), false);
  assert.equal(M.isPartitioned({}), false);
  assert.equal(M.isPartitioned(""), false);
  assert.equal(M.isPartitioned('{"userContextId":4}'), false);
  assert.equal(M.isPartitioned({ partitionKey: "(https,example.com)" }), true);
  assert.equal(M.isPartitioned('{"partitionKey":"(https,example.com)"}'), true);
  assert.equal(M.isPartitioned({ partitionKeyPattern: { baseDomain: "example.com" } }), true);
  assert.equal(M.isPartitioned({ partitionKeyPattern: {} }), false);
});
