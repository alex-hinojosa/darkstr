/**
 * 0057r4 (Proof #88 item 5a): a persona's WebGL RENDERER and
 * UNMASKED_RENDERER_WEBGL are what Gecko reports for that GPU: the raw
 * GL_RENDERER through Gecko's SanitizeRenderer (bucket + ", or similar"),
 * consistent with each other; UNMASKED_VENDOR_WEBGL is the persona's raw
 * vendor and VENDOR stays stock "Mozilla". Page and worker preludes call the
 * native getter first, so a missing WEBGL_debug_renderer_info (null +
 * INVALID_ENUM) and RFP constants ("Mozilla") stay stock.
 * Expected strings are traced by hand from dom/canvas/SanitizeRenderer.cpp
 * (Firefox 156) in the LibreWolf tree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const F57 = join(root, "patches/0057-files");
globalThis.JSProcessActorChild ??= class {};
globalThis.JSWindowActorChild ??= class {};
globalThis.Services ??= { obs: { addObserver() {} } };
const WHC = await import(pathToFileURL(join(F57, "DarkstrWorkerHooksChild.sys.mjs")).href);
const { geckoSanitizeRenderer, personaGlString, buildDepthOverrides } = WHC;

// Every shipped copy of the two child modules (later pins re-ship WorkerHooksChild).
const childCopies = ["0057-files", "0058-files", "0058b-files", "0058c-files"]
  .flatMap((d) => ["DarkstrDepthHooksChild.sys.mjs", "DarkstrWorkerHooksChild.sys.mjs"].map((f) => join(root, "patches", d, f)))
  .filter((p) => existsSync(p));

const SANITIZED = [
  // macOS (CGL raw strings; Apple silicon reports "Apple Mx")
  ["Apple M1", "Apple M1, or similar"],
  ["Apple M2", "Apple M1, or similar"],
  ["Intel(R) Iris(R) Plus Graphics", "Intel(R) HD Graphics, or similar"],
  ["Intel(R) Iris(TM) Plus Graphics OpenGL Engine", "Intel(R) HD Graphics, or similar"],
  ["Intel(R) Iris(TM) Plus Graphics 655 OpenGL Engine", "Intel(R) HD Graphics 400, or similar"],
  ["Intel(R) UHD Graphics 630 OpenGL Engine", "Intel(R) HD Graphics 400, or similar"],
  ["ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Version 15.3 (Build 24D60))", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1), or similar"],
  // Windows (ANGLE Direct3D11)
  ["ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar"],
  ["ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar"],
  ["ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ANGLE (AMD, Radeon R9 200 Series Direct3D11 vs_5_0 ps_5_0), or similar"],
  // Linux (Mesa / proprietary)
  ["Mesa Intel(R) UHD Graphics 630 (CFL GT2)", "Intel(R) HD Graphics 400, or similar"],
  ["NVIDIA GeForce RTX 3060/PCIe/SSE2", "NVIDIA GeForce GTX 980, or similar"],
  ["AMD Radeon RX 580 (radeonsi, polaris10, LLVM 15.0.7, DRM 3.54, 6.8.0)", "Radeon R9 200 Series, or similar"],
  ["llvmpipe (LLVM 15.0.7, 256 bits)", "llvmpipe, or similar"],
  // Gecko's fallbacks
  ["ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)", "Generic Renderer"],
  ["Some Unknown GPU", "Generic Renderer"],
  ["Intel(R) Arc(TM) A770 Graphics", "Intel(R) Arc(TM) A750 Graphics, or similar"],
  ["Radeon HD 4850", "Radeon HD 3200 Graphics, or similar"],
  ["Quadro P2000", "GeForce GTX 980, or similar"],
  ["NV E7", "Generic Renderer"],
];

test("0057r4: geckoSanitizeRenderer matches Gecko's buckets and suffix", () => {
  for (const [raw, want] of SANITIZED) {
    assert.equal(geckoSanitizeRenderer(raw), want, raw);
  }
});

test("0057r4: every persona pool GPU sanitizes to a real Gecko bucket (never Generic Renderer)", () => {
  const src = readFileSync(join(F57, "DarkstrDepthHooks.sys.mjs"), "utf8");
  const pool = src.slice(src.indexOf("const GPU_BY_OS = {"), src.indexOf("};", src.indexOf("const GPU_BY_OS = {")));
  const renderers = [...pool.matchAll(/renderer: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(renderers.length >= 9, "pool parsed");
  for (const r of renderers) {
    const s = geckoSanitizeRenderer(r);
    assert.ok(s.endsWith(", or similar"), `${r} -> ${s}`);
  }
  assert.ok(!pool.includes("OpenGL 4.5"), "Windows entries are ANGLE Direct3D11, as Firefox on Windows");
});

test("0057r4: personaGlString keeps stock non-strings / RFP constants, else the persona's Gecko string", () => {
  const intel = { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" };
  assert.equal(personaGlString(0x9246, null, intel), null);
  assert.equal(personaGlString(0x9245, null, intel), null);
  assert.equal(personaGlString(0x9246, "Mozilla", intel), "Mozilla");
  assert.equal(personaGlString(0x1f01, "Mozilla", intel), "Mozilla");
  assert.equal(personaGlString(0x9245, "Mozilla AAAAAAAAAAA=", intel), "Mozilla AAAAAAAAAAA=");
  assert.equal(personaGlString(0x1f01, "Apple M1, or similar", intel), "Intel(R) HD Graphics, or similar");
  assert.equal(personaGlString(0x9246, "Apple M1, or similar", intel), "Intel(R) HD Graphics, or similar");
  assert.equal(personaGlString(0x9246, "Apple M1", intel, false), "Intel(R) Iris(R) Plus Graphics");
  assert.equal(personaGlString(0x1f01, "Apple M1", intel, false), "Intel(R) HD Graphics, or similar", "RENDERER is always sanitized");
  assert.equal(personaGlString(0x9245, "Apple", intel), "Intel Inc.");
  const m2 = { vendor: "Apple", renderer: "Apple M2" };
  assert.equal(personaGlString(0x1f01, "Apple M1, or similar", m2), "Apple M1, or similar");
  assert.equal(personaGlString(0x9246, "Apple M1, or similar", m2), "Apple M1, or similar");
});

function runWorkerPrelude(gpu, native) {
  const calls = [];
  function makeProto() {
    return {
      getParameter(p) {
        calls.push(p);
        return Object.prototype.hasOwnProperty.call(native, p) ? native[p] : 7;
      },
    };
  }
  const WebGLRenderingContext = function () {};
  WebGLRenderingContext.prototype = makeProto();
  const WebGL2RenderingContext = function () {};
  WebGL2RenderingContext.prototype = makeProto();
  const prelude = buildDepthOverrides({ canvasSeed: 1234, gpu });
  // Only the WebGL globals exist in this fake worker; everything else in the
  // prelude is typeof-guarded.
  new Function("WebGLRenderingContext", "WebGL2RenderingContext", prelude)(WebGLRenderingContext, WebGL2RenderingContext);
  const gl1 = Object.create(WebGLRenderingContext.prototype);
  const gl2 = Object.create(WebGL2RenderingContext.prototype);
  return { gl1, gl2, calls };
}

test("0057r4: worker prelude (all worker kinds, WebGL1 + WebGL2) reports the same strings as the page", () => {
  const intel = { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" };
  const native = { 0x1f00: "Mozilla", 0x1f01: "Apple M1, or similar", 0x9245: "Apple", 0x9246: "Apple M1, or similar" };
  const { gl1, gl2, calls } = runWorkerPrelude(intel, native);
  for (const gl of [gl1, gl2]) {
    assert.equal(gl.getParameter(0x1f00), "Mozilla");
    assert.equal(gl.getParameter(0x1f01), "Intel(R) HD Graphics, or similar");
    assert.equal(gl.getParameter(0x9246), "Intel(R) HD Graphics, or similar");
    assert.equal(gl.getParameter(0x9245), "Intel Inc.");
    assert.equal(gl.getParameter(0x0d33), 7, "other params pass through");
  }
  assert.ok(calls.includes(0x9246) && calls.includes(0x1f01), "native getter is consulted first");
  // No WEBGL_debug_renderer_info: stock null stays null.
  const { gl1: bare } = runWorkerPrelude(intel, { 0x1f01: "Apple M1, or similar", 0x9245: null, 0x9246: null });
  assert.equal(bare.getParameter(0x9246), null);
  assert.equal(bare.getParameter(0x9245), null);
  // RFP: "Mozilla" stays.
  const { gl2: rfp } = runWorkerPrelude(intel, { 0x1f01: "Mozilla", 0x9245: "Mozilla", 0x9246: "Mozilla" });
  assert.equal(rfp.getParameter(0x1f01), "Mozilla");
  assert.equal(rfp.getParameter(0x9246), "Mozilla");
});

test("0057r4: page hook routes RENDERER / UNMASKED_* through personaGlString after the native call", () => {
  const src = readFileSync(join(F57, "DarkstrDepthHooksChild.sys.mjs"), "utf8");
  assert.match(src, /param === 0x1f01 \|\| param === 0x9245 \|\| param === 0x9246\) \{[\s\S]{0,400}personaGlString\(\s*param,\s*Reflect\.apply\(origGetParameter, this, \[param\]\)/);
  assert.ok(!/if \(param === 0x9246\) \{\s*return gpu\.renderer;/.test(src), "no raw renderer short-circuit");
  assert.match(src, /const sanitizeUnmasked = sanitizeUnmaskedPref\(\);/);
});

test("0057r4: the sanitizer block is byte-identical in every shipped child module", () => {
  const marker = "// 0057r4: Gecko's WebGL renderer sanitizer";
  const endMarker = "export function personaGlString(";
  const blocks = childCopies.map((p) => {
    const s = readFileSync(p, "utf8");
    const a = s.indexOf(marker);
    const e = s.indexOf("\n}\n", s.indexOf(endMarker));
    assert.ok(a >= 0 && e > a, `sanitizer block in ${p}`);
    return s.slice(a, e + 3);
  });
  assert.ok(blocks.length >= 2);
  for (const b of blocks) assert.equal(b, blocks[0]);
});

test("0057r4: page getExtension('WEBGL_debug_renderer_info') is the native object, never a stub", () => {
  const src = readFileSync(new URL("../patches/0057-files/DarkstrDepthHooksChild.sys.mjs", import.meta.url), "utf8");
  const stubbed = src.match(/const STUBBED_EXTENSIONS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(stubbed, "STUBBED_EXTENSIONS present");
  assert.ok(!stubbed[1].includes("WEBGL_debug_renderer_info"), "debug_renderer_info not stubbed");
  assert.ok(!/UNMASKED_VENDOR_WEBGL:\s*0x9245/.test(src), "no plain-object WEBGL_debug_renderer_info stub");
  assert.match(src, /if \(want === "WEBGL_debug_renderer_info"\) \{[^}]*Reflect\.apply\(origGetExtension, this, \[want\]\)/);
});
