/**
 * 0058b: WebGPU persona gate. On an Apple-silicon host a non-Apple persona has no
 * WebGPU at all (C++ Instance::PrefEnabled gate = stock dom.webgpu.enabled=false
 * shape); Apple personas are passthrough (Proof #88 r3 5b); the Intel adapter
 * architecture is a Mac-real generation. Tests run against patches/0058b-files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(root, "patches/0058b-files");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
const WHC = await import(pathToFileURL(join(F, "DarkstrWorkerHooksChild.sys.mjs")).href);
const { isAppleSiliconHost, isApplePersonaGpu, webGpuHiddenFor, writeWebGpuGateBag, fillWorkerPersonaBag } = WHC;

const APPLE_HOST = { OS: "Darwin", XPCOMABI: "aarch64-gcc3" };
const INTEL = { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" };
const M2 = { vendor: "Apple", renderer: "Apple M2" };
const persona = (gpu) => ({
  decision: "persona",
  persona: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0", platform: "MacIntel", hardwareConcurrency: 8, languages: ["en-US"] },
  depth: { gpu, seeds: {} },
  reason: "persona",
});
function bag() {
  const v = {};
  return { v, setPropertyAsBool: (k, x) => (v[k] = !!x), setPropertyAsAString: (k, x) => (v[k] = String(x)), setPropertyAsUint32: (k, x) => (v[k] = x >>> 0) };
}
function body(file) {
  const s = read(`patches/0058b-files/${file}`);
  const i = s.indexOf("const WEBGPU_BODY = `");
  return s.slice(i + "const WEBGPU_BODY = `".length, s.indexOf("\n`;", i) + 1);
}

test("0058b: pin files match SHA256SUMS and their bases are the shipped earlier pins", () => {
  for (const line of read("patches/0058b-files/SHA256SUMS").trim().split("\n")) {
    const [h, n] = line.trim().split(/\s+/);
    assert.equal(sha(`patches/0058b-files/${n}`), h, n);
  }
  const base = Object.fromEntries(read("patches/0058b-files/BASE_SHA256SUMS").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  const shipped = {
    "browser/components/DarkstrDepthHooksChild.sys.mjs": "patches/0057-files/DarkstrDepthHooksChild.sys.mjs",
    "browser/components/DarkstrWorkerHooks.sys.mjs": "patches/0057-files/DarkstrWorkerHooks.sys.mjs",
    "browser/components/DarkstrWorkerHooksChild.sys.mjs": "patches/0058-files/DarkstrWorkerHooksChild.sys.mjs",
    "dom/base/DarkstrNavigatorHooks.cpp": "patches/0058-files/DarkstrNavigatorHooks.cpp",
    "dom/base/DarkstrNavigatorHooks.h": "patches/0058-files/DarkstrNavigatorHooks.h",
  };
  for (const [tree, pin] of Object.entries(shipped)) {
    assert.equal(base[tree], sha(pin), `${tree} base is ${pin}`);
  }
  assert.equal(Object.keys(base).length, 8);
});

test("0058b: Apple-silicon host detection", () => {
  assert.equal(isAppleSiliconHost(APPLE_HOST), true);
  assert.equal(isAppleSiliconHost({ OS: "Darwin", XPCOMABI: "x86_64-gcc3" }), false);
  assert.equal(isAppleSiliconHost({ OS: "WINNT", XPCOMABI: "aarch64-msvc" }), false);
  assert.equal(isAppleSiliconHost(undefined), false);
});

test("0058b: hide decision (non-Apple persona on Apple silicon only)", () => {
  assert.equal(isApplePersonaGpu(M2), true);
  assert.equal(isApplePersonaGpu({}), true); // WEBGPU_BODY defaults: Apple / Apple M1
  assert.equal(isApplePersonaGpu(INTEL), false);
  assert.equal(webGpuHiddenFor(persona(INTEL), true), true);
  assert.equal(webGpuHiddenFor(persona(M2), true), false);
  assert.equal(webGpuHiddenFor(persona(INTEL), false), false);
  assert.equal(webGpuHiddenFor({ decision: "native", depth: null }, true), false);
  assert.equal(webGpuHiddenFor({ decision: "off" }, true), false);
  assert.equal(webGpuHiddenFor(null, true), false);
});

test("0058b: window gate bag (definite answers only)", () => {
  let b = bag();
  assert.equal(writeWebGpuGateBag(b, { decision: "native", reason: "no-window" }, true), null);
  assert.deepEqual(b.v, {});
  b = bag();
  assert.equal(writeWebGpuGateBag(b, { decision: "native", reason: "pid-mismatch" }, true), null);
  assert.deepEqual(b.v, {});
  b = bag();
  assert.equal(writeWebGpuGateBag(b, persona(INTEL), true), true);
  assert.equal(b.v.hideWebGpu, true);
  b = bag();
  assert.equal(writeWebGpuGateBag(b, persona(M2), true), false);
  assert.equal(b.v.hideWebGpu, false);
  b = bag();
  assert.equal(writeWebGpuGateBag(b, { decision: "native", depth: null, reason: "native-compatible" }, true), false);
  assert.equal(b.v.hideWebGpu, false);
});

test("0058b: worker persona bag carries hideWebGpu for a non-Apple persona on Apple silicon", () => {
  const saved = globalThis.Services.appinfo;
  try {
    globalThis.Services.appinfo = APPLE_HOST;
    let b = bag();
    fillWorkerPersonaBag(b, persona(INTEL));
    assert.equal(b.v.hideWebGpu, true);
    b = bag();
    fillWorkerPersonaBag(b, persona(M2));
    assert.equal(b.v.hideWebGpu, undefined);
    globalThis.Services.appinfo = { OS: "Darwin", XPCOMABI: "x86_64-gcc3" };
    b = bag();
    fillWorkerPersonaBag(b, persona(INTEL));
    assert.equal(b.v.hideWebGpu, undefined);
  } finally {
    globalThis.Services.appinfo = saved;
  }
});

test("0058b: WEBGPU_BODY byte-identical in both child modules; Intel architecture is Mac-real", () => {
  const a = body("DarkstrDepthHooksChild.sys.mjs");
  assert.equal(a, body("DarkstrWorkerHooksChild.sys.mjs"));
  assert.ok(!a.includes('architecture: "gen-12lp", device'), "no fixed gen-12lp Intel return");
  const src = a.slice(a.indexOf("function intelArchitecture"), a.indexOf("// WebGL persona"));
  const intelArchitecture = new Function(`${src}\nreturn intelArchitecture;`)();
  assert.equal(intelArchitecture("Intel(R) Iris(R) Plus Graphics"), "gen-11");
  assert.equal(intelArchitecture("Intel(R) Iris(R) Plus Graphics, or similar"), "gen-11");
  assert.equal(intelArchitecture("Intel(R) Iris(R) Plus Graphics 655"), "gen-9");
  assert.equal(intelArchitecture("Intel(R) UHD Graphics 630"), "gen-9");
  assert.equal(intelArchitecture("Intel(R) HD Graphics 630"), "gen-9");
  assert.equal(intelArchitecture("Intel(R) Iris(R) Xe Graphics"), "gen-12lp");
});

function fakeGpu() {
  const info = { vendor: "", architecture: "", device: "", description: "" };
  const adapter = { info, features: new Set(["texture-compression-astc"]), limits: {}, requestDevice: async () => ({ adapterInfo: info }) };
  class GPU { async requestAdapter() { return adapter; } }
  const proto = GPU.prototype;
  const native = proto.requestAdapter;
  return { gpu: new GPU(), GPU, proto, native, adapter, info };
}
function runBody(gpuVendor, gpuRenderer) {
  const f = fakeGpu();
  const install = new Function("navigator", "GPU", "seed", "gpuVendor", "gpuRenderer", body("DarkstrDepthHooksChild.sys.mjs"));
  const hooks = install({ gpu: f.gpu }, f.GPU, 1, gpuVendor, gpuRenderer);
  return { f, hooks };
}

test("0058b (Proof #88 r3 5b): Apple persona is WebGPU passthrough (native adapter + empty native info)", async () => {
  for (const r of ["Apple M1", "Apple M2"]) {
    const { f, hooks } = runBody("Apple", r);
    assert.equal(hooks.requestAdapter, null, "no wrapper installed");
    assert.equal(f.proto.requestAdapter, f.native, "requestAdapter is the native function");
    const a = await f.gpu.requestAdapter();
    assert.equal(a, f.adapter, "native adapter object");
    assert.equal(a.info, f.info, "native GPUAdapterInfo object");
    assert.deepEqual({ ...a.info }, { vendor: "", architecture: "", device: "", description: "" });
    assert.equal((await a.requestDevice()).adapterInfo, f.info);
  }
});

test("0058b: non-Apple persona (non-Apple-silicon host path) still gets the persona AdapterInfo, gen-11 for Iris Plus", async () => {
  const { f, hooks } = runBody(INTEL.vendor, INTEL.renderer);
  assert.equal(typeof hooks.requestAdapter, "function");
  const a = await f.gpu.requestAdapter();
  assert.equal(a.info.vendor, "intel");
  assert.equal(a.info.architecture, "gen-11");
  assert.equal(a.features.has("texture-compression-astc"), false);
});

test("0058b: C++ gate sits at the WebIDL Func and the canvas context lookup", () => {
  const inst = read("patches/0058b-files/Instance.cpp");
  assert.match(inst, /bool Instance::PrefEnabled\(JSContext\* aCx, JSObject\* aObj\) \{\s*if \(!PrefEnabled\(\)\) \{/);
  assert.match(inst, /return !dom::DarkstrNavigatorHooks::WebGpuHiddenFor\(aObj\);/);
  assert.match(read("patches/0058b-files/Instance.h"), /static bool PrefEnabled\(JSContext\* aCx, JSObject\* aObj\);/);
  assert.match(read("patches/0058b-files/CanvasRenderingContextHelper.cpp"),
    /contextType == CanvasContextType::WebGPU && aCx &&\s*DarkstrNavigatorHooks::WebGpuHiddenFor\(JS::CurrentGlobalOrNull\(aCx\)\)\) \{\s*return nullptr;/);
  const nav = read("patches/0058b-files/DarkstrNavigatorHooks.cpp");
  assert.match(nav, /kDarkstrWebGpuGateTopic\[\] = "darkstr-webgpu-gate-resolve"/);
  assert.match(nav, /"inner-window-destroyed"/);
  assert.match(nav, /nsContentUtils::IsSafeToRunScript\(\)/);
  assert.match(nav, /persona->mHideWebGpu = hideWebGpu;/);
  assert.match(read("patches/0058b-files/DarkstrNavigatorHooks.h"), /static bool WebGpuHiddenFor\(JSObject\* aGlobal\);/);
  const wh = read("patches/0058b-files/DarkstrWorkerHooks.sys.mjs");
  assert.match(wh, /export const WEBGPU_GATE_TOPIC = "darkstr-webgpu-gate-resolve";/);
  assert.match(wh, /observers: \[WORKER_PERSONA_TOPIC, WEBGPU_GATE_TOPIC\]/);
  assert.match(wh, /if \(kind !== "window"\) \{/);
  assert.match(read("patches/0058b-files/DarkstrWorkerHooksChild.sys.mjs"), /const WEBGPU_GATE_TOPIC = "darkstr-webgpu-gate-resolve";/);
});

test("0058b: a document resolve (window gate / page worker) takes the document's own depth seeds, not bc's current document", () => {
  const wh = read("patches/0058b-files/DarkstrWorkerHooks.sys.mjs");
  assert.match(wh, /docWgp = wgp;/);
  assert.match(wh, /depthSeedsForBrowsingContext\(bc, docWgp\)/);
  assert.doesNotMatch(wh, /depthSeedsForBrowsingContext\(bc\)\)/);
});
