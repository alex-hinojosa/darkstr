/**
 * 0058c (Proof #95 note): the 0058b WebGPU gate keys on the persona's OS and GPU vendor. On an
 * Apple-silicon host a Windows / Linux persona -- seeded or a pasted snapshot, with or without a
 * depth GPU -- gets no WebGPU (stock dom.webgpu.enabled=false shape), never Apple adapter passthrough.
 * Tests run against patches/0058c-files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
const WHC = await import(pathToFileURL(join(root, "patches/0058c-files/DarkstrWorkerHooksChild.sys.mjs")).href);
const { isMacPersona, webGpuHiddenFor, writeWebGpuGateBag, fillWorkerPersonaBag } = WHC;

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0",
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/156.0 Mobile/15E148 Safari/605.1.15",
};
const PLAT = { mac: "MacIntel", win: "Win32", linux: "Linux x86_64", ios: "iPhone" };
const APPLE = { vendor: "Apple", renderer: "Apple M2" };
const INTEL = { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" };
const NVIDIA = { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce RTX 3060" };
const r = (os, gpu, extra = {}) => ({
  decision: "persona",
  persona: { userAgent: UA[os], platform: PLAT[os], hardwareConcurrency: 8, languages: ["en-US"], ...extra },
  depth: gpu === undefined ? null : { gpu, seeds: {} },
});
function bag() {
  const v = {};
  return { v, setPropertyAsBool: (k, x) => (v[k] = !!x), setPropertyAsAString: (k, x) => (v[k] = String(x)), setPropertyAsUint32: (k, x) => (v[k] = x >>> 0) };
}

test("0058c: pin files match SHA256SUMS; base is the shipped 0058b copy; patch + apply script", () => {
  for (const line of read("patches/0058c-files/SHA256SUMS").trim().split("\n")) {
    const [h, n] = line.trim().split(/\s+/);
    assert.equal(sha(`patches/0058c-files/${n}`), h, n);
  }
  const base = Object.fromEntries(read("patches/0058c-files/BASE_SHA256SUMS").trim().split("\n").map((l) => l.trim().split(/\s+/).reverse()));
  assert.deepEqual(base, {
    "browser/components/DarkstrWorkerHooksChild.sys.mjs": sha("patches/0058b-files/DarkstrWorkerHooksChild.sys.mjs"),
    "browser/components/DarkstrDepthHooks.sys.mjs": sha("patches/0057-files/DarkstrDepthHooks.sys.mjs"),
  });
  const sh = read("scripts/apply-0058c-webgpu-gate-os-mini.sh");
  assert.match(sh, /0058c-darkstr-webgpu-gate-os\.patch/);
  assert.match(sh, /obj-aarch64-apple-darwin25\.6\.0/);
  assert.doesNotMatch(sh.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n"), /\bmv\b/);
  assert.match(read("patches/0058c-darkstr-webgpu-gate-os.patch"), /^\+export function isMacPersona\(persona\)/m);
});

test("0058c: isMacPersona -- UA OS token first, then platform, unknown = host (Mac)", () => {
  assert.equal(isMacPersona({ userAgent: UA.mac, platform: "MacIntel" }), true);
  assert.equal(isMacPersona({ userAgent: UA.win, platform: "Win32" }), false);
  assert.equal(isMacPersona({ userAgent: UA.linux, platform: "Linux x86_64" }), false);
  assert.equal(isMacPersona({ userAgent: UA.ios, platform: "iPhone" }), false, "iOS says 'like Mac OS X' but is not macOS");
  // pasted snapshot without a platform field (0058 derives it later): UA decides
  assert.equal(isMacPersona({ userAgent: UA.win }), false);
  assert.equal(isMacPersona({ userAgent: UA.linux }), false);
  // UA wins over a contradictory platform (as 0058 osOfSnapshot)
  assert.equal(isMacPersona({ userAgent: UA.win, platform: "MacIntel" }), false);
  assert.equal(isMacPersona({ userAgent: UA.mac, platform: "Win32" }), true);
  // no UA OS token: platform decides
  assert.equal(isMacPersona({ userAgent: "Mozilla/5.0", platform: "Win32" }), false);
  assert.equal(isMacPersona({ platform: "MacIntel" }), true);
  assert.equal(isMacPersona({}), true);
  assert.equal(isMacPersona(null), true);
});

test("0058c: gate matrix on an Apple-silicon host -- WebGPU only for macOS + Apple GPU", () => {
  const cases = [
    ["mac", APPLE, false], ["mac", {}, false], ["mac", INTEL, true], ["mac", NVIDIA, true],
    ["win", APPLE, true], ["win", {}, true], ["win", INTEL, true], ["win", NVIDIA, true], ["win", undefined, true],
    ["linux", APPLE, true], ["linux", {}, true], ["linux", NVIDIA, true], ["linux", undefined, true],
    ["ios", APPLE, true],
    ["mac", undefined, false], // no depth: unchanged 0058b passthrough for a Mac persona
  ];
  for (const [os, gpu, hide] of cases) {
    assert.equal(webGpuHiddenFor(r(os, gpu), true), hide, `${os} ${JSON.stringify(gpu)}`);
  }
  // pasted snapshot without a platform field
  assert.equal(webGpuHiddenFor(r("win", APPLE, { platform: undefined }), true), true);
});

test("0058c: never on other hosts, never for native / off decisions", () => {
  for (const os of ["mac", "win", "linux"]) assert.equal(webGpuHiddenFor(r(os, APPLE), false), false);
  assert.equal(webGpuHiddenFor({ decision: "native", persona: { userAgent: UA.win }, depth: null }, true), false);
  assert.equal(webGpuHiddenFor({ decision: "off" }, true), false);
  assert.equal(webGpuHiddenFor(null, true), false);
});

test("0058c: window gate bag and worker persona bag carry the OS-keyed answer", () => {
  let b = bag();
  assert.equal(writeWebGpuGateBag(b, r("win", APPLE), true), true);
  assert.equal(b.v.hideWebGpu, true);
  b = bag();
  assert.equal(writeWebGpuGateBag(b, r("mac", APPLE), true), false);
  assert.equal(b.v.hideWebGpu, false);
  const saved = globalThis.Services.appinfo;
  try {
    globalThis.Services.appinfo = { OS: "Darwin", XPCOMABI: "aarch64-gcc3" };
    for (const [os, gpu, hide] of [["linux", APPLE, true], ["win", undefined, true], ["mac", APPLE, undefined]]) {
      b = bag();
      fillWorkerPersonaBag(b, r(os, gpu));
      assert.equal(b.v.hideWebGpu, hide, `${os} worker`);
    }
  } finally {
    globalThis.Services.appinfo = saved;
  }
});
