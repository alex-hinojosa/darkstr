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
  assert.equal(j.v, 1);
  assert.equal(j.e.length, 1);
  assert.deepEqual(Object.keys(j.e[0]).sort(), ["c", "h", "s", "t"]);
  assert.equal(j.e[0].c, "0");
  assert.equal(j.e[0].s, a);
  assert.equal(j.e[0].h, createHmac("sha256", Buffer.from(S._key)).update("a56.test").digest("hex"));
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
  assert.deepEqual(j.e.map((e) => e.c).sort(), ["0", "2"]);
  assert.ok(!j.e.some((e) => e.c === "p"));
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
  assert.notEqual(fileJSON().e[0].h, createHmac("sha256", Buffer.from(S._key)).update("a56.test").digest("hex"));
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
  assert.deepEqual(fileJSON().e.map((e) => e.c), ["0"]);
  await CL.deleteByPrincipal({ host: "a56.test", originAttributes: { userContextId: 0 } });
  assert.equal(fileJSON().e.length, 0);
  assert.notEqual(S.seedFor("0", "a56.test"), a0);
});

test("range clear by first-seen day", async () => {
  wipe(); prefs.clear();
  await restart();
  S.seedFor("0", "a56.test"); S.seedFor("0", "b56.test");
  await S.flush();
  // backdate b56 to 10 days ago (as if first seen then)
  const today = M.dayOf(Date.now());
  for (const e of S._disk.values()) if (e.h === createHmac("sha256", Buffer.from(S._key)).update("b56.test").digest("hex")) e.t = today - 10;
  for (const r of S._session.values()) if (r.site === "b56.test") r.t = today - 10;
  const nowUs = Date.now() * 1000;
  await CL.deleteByRange(nowUs - 3600e6, nowUs); // "last hour" -> today's first-seen entries
  const left = fileJSON().e;
  assert.equal(left.length, 1);
  assert.equal(left[0].t, today - 10);
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
  await CL.deleteByRange(0, 1000); // 1970
  assert.equal(fileText(), before);
  assert.ok(!ops.some((o) => o[0] === "write" || o[0] === "move"), JSON.stringify(ops));
  await CL.deleteBySite("a56.test", {}); // a real hit is removed even off
  assert.equal(fileJSON().e.length, 0);
});
