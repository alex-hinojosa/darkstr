/**
 * 0057 (Fable B2): depth farbling seeded per site.
 * Offline: pure noise helpers are lifted from the shipped sources (window
 * DepthHooksChild + worker prelude) and compared; gate / IPC wiring is checked
 * on the shipped text. Live coverage: ~/AgentDocs/proof/darkstr-0057-*.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(root, "patches", "0057-files");
const src = (n) => readFileSync(join(F, n), "utf8");
const DHC = src("DarkstrDepthHooksChild.sys.mjs");
const DH = src("DarkstrDepthHooks.sys.mjs");
const NP = src("DarkstrNativePersona.sys.mjs");
const WH = src("DarkstrWorkerHooks.sys.mjs");

function lift(source, name) {
  const at = source.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} present`);
  const end = source.indexOf("\n}\n", at);
  return source.slice(at, end + 2);
}
// window helpers (Cu.waiveXrays is identity outside Gecko)
const win = new Function(
  "Cu",
  `${lift(DHC, "pixelNoise")}\n${lift(DHC, "applyCanvasNoiseRect")}\n${lift(DHC, "applyCanvasNoise")}\nreturn { pixelNoise, applyCanvasNoiseRect, applyCanvasNoise };`
)({ waiveXrays: (x) => x });

// worker prelude helpers
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
const WHC = await import(pathToFileURL(join(F, "DarkstrWorkerHooksChild.sys.mjs")).href);
const prelude = WHC.buildWorkerPrelude({ canvasSeed: 7, audioSeed: 9, fontSeed: 11, webgpuSeed: 5, gpu: { vendor: "V", renderer: "R" } });
const line = (re) => prelude.split("\n").find((l) => re.test(l));
const wrk = new Function(`${line(/function __pn\(/)}\n${line(/function __ar\(/)}\nreturn { __pn, __ar };`)();

function surface(w, h, seed = 1) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < px.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; px[i] = s >>> 24; }
  for (let p = 0; p < w * h; p++) px[p * 4 + 3] = p % 5 === 0 ? 128 : (p % 7 === 0 ? 0 : 255);
  return px;
}
const rect = (px, w, x, y, rw, rh) => {
  const out = new Uint8ClampedArray(rw * rh * 4);
  for (let r = 0; r < rh; r++) out.set(px.subarray(((y + r) * w + x) * 4, ((y + r) * w + x + rw) * 4), r * rw * 4);
  return out;
};

test("0057 sub-rect reads agree with the full read (absolute-pixel keyed)", () => {
  const w = 23, h = 17, seed = 0xdeadbeef;
  const full = surface(w, h); win.applyCanvasNoise(full, seed, w, h);
  for (const [x, y, rw, rh] of [[0, 0, w, h], [3, 4, 5, 6], [w - 1, h - 1, 1, 1], [10, 0, 13, 17]]) {
    const sub = rect(surface(w, h), w, x, y, rw, rh);
    win.applyCanvasNoiseRect(sub, seed, x, y, rw, rh, w, h, false);
    assert.deepEqual(sub, rect(full, w, x, y, rw, rh), `rect ${x},${y},${rw},${rh}`);
  }
});

test("0057 negative sw/sh and out-of-bounds parts behave like the normalized rect", () => {
  const w = 9, h = 8, seed = 42;
  const a = rect(surface(w, h), w, 2, 3, 4, 3); win.applyCanvasNoiseRect(a, seed, 6, 6, -4, -3, w, h, false);
  const b = rect(surface(w, h), w, 2, 3, 4, 3); win.applyCanvasNoiseRect(b, seed, 2, 3, 4, 3, w, h, false);
  assert.deepEqual(a, b);
  const oob = new Uint8ClampedArray(4 * 4 * 4).fill(255); // rect (-2,-2,4,4): only (0..1,0..1) in-bounds
  win.applyCanvasNoiseRect(oob, seed, -2, -2, 4, 4, w, h, false);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (r < 2 || c < 2) assert.deepEqual([...oob.subarray((r * 4 + c) * 4, (r * 4 + c) * 4 + 4)], [255, 255, 255, 255]);
  }
});

test("0057 only opaque pixels are noised (premultiplied round trip safe; blank stays blank)", () => {
  const w = 16, h = 16, seed = 99;
  const before = surface(w, h), after = surface(w, h);
  win.applyCanvasNoise(after, seed, w, h);
  let changed = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (before[i + 3] !== 255) assert.deepEqual([...after.subarray(i, i + 4)], [...before.subarray(i, i + 4)]);
    else { assert.equal(after[i + 3], 255); for (let k = 0; k < 3; k++) { assert.ok(Math.abs(after[i + k] - before[i + k]) <= 3); if (after[i + k] !== before[i + k]) changed++; } }
  }
  assert.ok(changed > 50, "opaque pixels are noised");
  const blank = new Uint8ClampedArray(w * h * 4); win.applyCanvasNoise(blank, seed, w, h);
  assert.ok(blank.every((v) => v === 0));
});

test("0057 readPixels flipY: GL bottom-up rows get the same noise as the 2D top-down pixel", () => {
  const w = 11, h = 7, seed = 1234;
  const top = surface(w, h); const want = top.slice(); win.applyCanvasNoise(want, seed, w, h);
  const gl = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) gl.set(top.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);
  win.applyCanvasNoiseRect(gl, seed, 0, 0, w, h, w, h, true);
  for (let r = 0; r < h; r++) assert.deepEqual(gl.subarray(r * w * 4, (r + 1) * w * 4), want.subarray((h - 1 - r) * w * 4, (h - r) * w * 4));
  // GL sub-rect (x=2, y=1 from bottom, 3x2)
  const sub = new Uint8ClampedArray(3 * 2 * 4);
  for (let r = 0; r < 2; r++) sub.set(top.subarray(((h - 1 - (1 + r)) * w + 2) * 4, ((h - 1 - (1 + r)) * w + 5) * 4), r * 12);
  win.applyCanvasNoiseRect(sub, seed, 2, 1, 3, 2, w, h, true);
  for (let r = 0; r < 2; r++) assert.deepEqual(sub.subarray(r * 12, r * 12 + 12), want.subarray(((h - 2 - r) * w + 2) * 4, ((h - 2 - r) * w + 5) * 4));
});

test("0057 worker prelude noise is byte-identical to the window noise", () => {
  for (const [w, h, x, y, rw, rh, fy] of [[20, 12, 0, 0, 20, 12, false], [20, 12, 4, 2, 7, 5, false], [20, 12, 1, 1, 9, 4, true], [5, 5, 3, 3, -3, -2, false]]) {
    const a = rect(surface(w, h, 3), w, 0, 0, w, h), b = a.slice();
    const n = Math.abs(rw) * Math.abs(rh) * 4;
    const pa = a.slice(0, n), pb = b.slice(0, n);
    win.applyCanvasNoiseRect(pa, 777, x, y, rw, rh, w, h, fy);
    wrk.__ar(pb, 777, x, y, rw, rh, w, h, fy);
    assert.deepEqual(pa, pb);
  }
  for (let i = 0; i < 2000; i += 37) assert.equal(wrk.__pn(5, i, i & 255), win.pixelNoise(5, i, i & 255));
});

test("0057 worker prelude wraps OffscreenCanvas getImageData / convertToBlob / readPixels rect-aware, and measureText", () => {
  assert.match(prelude, /getImageData=function\(sx,sy,sw,sh\)\{var id=_oGID\.apply\(this,arguments\);try\{__ar\(id\.data,__s,sx,sy,sw,sh,this\.canvas\.width,this\.canvas\.height,false\)/);
  assert.match(prelude, /__ar\(p,__s,x,y,w,h,this\.drawingBufferWidth,this\.drawingBufferHeight,true\)/);
  assert.match(prelude, /var __fs=11;/);
  assert.match(prelude, /var __ff=0\.999\+\(\(__fs\/4294967295\)\/1000\)/);
  const noFont = WHC.buildWorkerPrelude({ canvasSeed: 7, audioSeed: 9, webgpuSeed: 5, gpu: { vendor: "V", renderer: "R" } });
  assert.match(noFont, /var __fs=-1;/);
  new Function(prelude); // compiles
  // window fudge formula is the same
  assert.match(DHC, /0\.999 \+ \(\(?\(?seeds\.fontSeed >>> 0\)? ?\/ 4294967295\)? ?\/ 1000\)?|fontFudge/);
});

test("0057 workerDepthFromSeeds forwards the document fontSeed", async () => {
  globalThis.ChromeUtils ??= { defineESModuleGetters() {}, importESModule: () => ({}) };
  const m = await import(pathToFileURL(join(F, "DarkstrWorkerHooks.sys.mjs")).href).catch(() => null);
  if (m?.workerDepthFromSeeds) {
    const d = m.workerDepthFromSeeds({ canvasSeed: 1, audioSeed: 2, fontSeed: 0xfffffffe });
    assert.equal(d.fontSeed, 0xfffffffe);
  } else {
    assert.match(WH, /fontSeed:\s*\n?\s*typeof seeds\.fontSeed === "number"/);
  }
});

test("0057 audio: float frequency dB offset = 20*log10(fudge), silence -Infinity stays", () => {
  const body = DHC.slice(DHC.indexOf("var fudge = 0.999"), DHC.indexOf("function contentKey(data)"));
  const env = new Function("seed", `${body}; return { fudge, fudgeDb, farbleFloatDb };`)(0x80000000);
  assert.ok(env.fudge >= 0.999 && env.fudge < 1);
  assert.equal(env.fudgeDb, 20 * Math.log10(env.fudge));
  const d = new Float32Array([-30, -Infinity, -100.5]); env.farbleFloatDb(d);
  assert.equal(d[1], -Infinity);
  assert.ok(Math.abs(d[0] - (-30 + env.fudgeDb)) < 1e-4);
  assert.match(DHC, /"floatDb"/);
  assert.doesNotMatch(DHC, /getFloatFrequencyData[^\n]*"float"\)/);
});

test("0057 gate: DH arms on per-site store seeds without darkstr.persona.seed", () => {
  const flat = DH.replace(/\s+/g, " ");
  assert.ok(flat.includes("const perSite = !!( pollutionActive && nativeHooks && !seeds && this._perSiteStoreActive()"));
  assert.ok(flat.includes("const armed = !!(pollutionActive && nativeHooks && (seeds || perSite));"));
  assert.match(DH, /plan\.perSite/);
  assert.match(DH, /_storeSeedForEtld/);
  assert.match(DH, /ROTATE_PER_SITE_PREF = "darkstr\.persona\.rotatePerSite"/);
  assert.match(NP, /_storeSeedForEtld\(etld, ctx\)/);
  assert.match(NP, /_storeRotationActive\(plan\)/);
  // fixed seed keeps the deterministic Proof path (store bypassed)
  const fn = NP.slice(NP.indexOf("_storeSeedForEtld(etld, ctx)"), NP.indexOf("_storeRotationActive(plan)"));
  assert.match(fn, /_fixedSeedSet\(\)/);
});

test("0057 sync seed pull: parent listener + child sync path with async fallback", () => {
  assert.match(DH, /MSG_SEEDS_SYNC = "DarkstrDepthHooks:GetSeedsSync"/);
  assert.match(DH, /SHARED_ARMED_KEY = "darkstr:depthArmed"/);
  assert.match(DH, /ppmm\.addMessageListener\(MSG_SEEDS_SYNC/);
  assert.match(DH, /ppmm\.removeMessageListener\(MSG_SEEDS_SYNC/);
  assert.match(DH, /retry: true/);
  assert.match(DHC, /sendSyncMessage\(\s*"DarkstrDepthHooks:GetSeedsSync"/);
  assert.match(DHC, /darkstr:depthArmed/);
  assert.match(DHC, /sendQuery/); // async fallback kept
});

test("0057 files: sums, baseline, patch headers", () => {
  const sums = readFileSync(join(F, "SHA256SUMS"), "utf8").trim().split("\n");
  assert.equal(sums.length, 6);
  for (const l of sums) {
    const [h, n] = l.split(/\s+/);
    assert.equal(createHash("sha256").update(readFileSync(join(F, n))).digest("hex"), h, n);
  }
  const base = readFileSync(join(F, "BASE_SHA256SUMS"), "utf8");
  const baseOf = { "DarkstrDepthHooksChild.sys.mjs": "0039-files" };
  for (const l of base.trim().split("\n")) {
    const [h, p] = l.split(/\s+/); const n = p.split("/").pop();
    if (n === "DarkstrDepthHooksParent.sys.mjs") continue; // baseline = 0017 patch (no -files pin)
    const dir = baseOf[n] ?? "0056-files";
    assert.equal(createHash("sha256").update(readFileSync(join(root, "patches", dir, n))).digest("hex"), h, `baseline ${n}`);
  }
  const patch = readFileSync(join(root, "patches", "0057-darkstr-depth-per-site.patch"), "utf8");
  assert.equal((patch.match(/^\+\+\+ b\//gm) || []).length, 6);
  assert.ok(readdirSync(join(root, "scripts")).includes("apply-0057-depth-per-site-mini.sh"));
});

test("0057 seeds resolve for the requesting document's own WindowGlobalParent", () => {
  const PAR = src("DarkstrDepthHooksParent.sys.mjs");
  assert.match(PAR, /depthSeedsForBrowsingContext\(\s*this\.browsingContext,\s*this\.manager\s*\)/);
  assert.match(DH, /depthSeedsForBrowsingContext\(bc, wgp = null\)/);
  assert.match(DH, /depthSeedsForBrowsingContext\(wgp\.browsingContext, wgp\)/);
  assert.match(DH, /DarkstrNativePersona\.documentDecision\(wgp\)/);
  assert.match(DH, /etld = decision\.site \|\| null/);
});

test("0057 install record keyed per inner global (no stacked hooks) + DOMDocElementInserted for reused windows", () => {
  const key = lift(DHC, "installKey");
  assert.match(key, /rawWindow\?\.HTMLCanvasElement\?\.prototype/);
  for (const fn of ["installDepthHooks", "uninstallDepthHooks"]) {
    const body = DHC.slice(DHC.indexOf(`function ${fn}(`), DHC.indexOf(`function ${fn}(`) + 400);
    assert.match(body, /const key = installKey\(rawWindow\)/, fn);
  }
  assert.match(DHC, /installedByWindow\.set\(key, \{ replacements \}\)/);
  assert.doesNotMatch(DHC, /installedByWindow\.(get|set|delete)\(rawWindow/);
  assert.match(DH, /DOMDocElementInserted: \{\}/);
  assert.match(DHC, /event\.type !== "DOMDocElementInserted"/);
  // reused-window event never adds async IPC (off mode stays idle)
  assert.match(DHC, /seeds === undefined && eventType === "DOMDocElementInserted"\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*return;/);
});

test("0057 replaceMethod never stacks on its own wrapper (waiver-safe identity)", () => {
  // Simulate waiver vs plain wrappers: unwaiveXrays maps both to one identity.
  const target = new Map();
  const Cu = {
    unwaiveXrays: (x) => (x && x.__plain) || x,
    exportFunction: (fn) => { const plain = function (...a) { return fn.apply(this, a); }; return plain; },
  };
  const env = new Function("Cu", `${lift(DHC, "unwaived")}\n${lift(DHC, "sameObject")}\nconst ourWrappers = new WeakMap();\n${lift(DHC, "methodIsInstalled")}\n${lift(DHC, "replaceMethod")}\nreturn { replaceMethod, methodIsInstalled };`)(Cu);
  const native = function getImageData() { return "native"; };
  const proto = { getImageData: native };
  const recs = [];
  const o1 = env.replaceMethod({}, proto, "getImageData", function () { return "w1"; }, recs);
  assert.equal(o1, native);
  // a waived read returns a distinct wrapper object for the same function
  const plain1 = proto.getImageData; const waived1 = function () {}; waived1.__plain = plain1;
  Object.defineProperty(proto, "getImageData", { value: waived1, configurable: true, writable: true });
  assert.ok(env.methodIsInstalled({ proto, name: "getImageData", wrapper: plain1 }), "waiver-safe identity");
  Object.defineProperty(proto, "getImageData", { value: plain1, configurable: true, writable: true });
  const o2 = env.replaceMethod({}, proto, "getImageData", function () { return "w2"; }, recs);
  assert.equal(o2, native, "second install wraps the native, not our first wrapper");
});
