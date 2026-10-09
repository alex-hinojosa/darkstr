/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 — JSWindowActor child (pin 2 + optional 0023 depth extension).
 * Canvas 2D noise / WebGL vendor·renderer + persona GPU cap buckets / OffscreenCanvas
 * window parity / AudioBuffer + AnalyserNode farbling from depth seeds.
 * Soft residual (0031): Brave-style silence-safe multiplicative audio farbling
 *   (fudge∈[0.999,1.0); zeros stay zero) + AnalyserNode / copyFromChannel.
 * Soft residual (0036): fonts coherence — Canvas/Offscreen measureText width,
 *   document.fonts.check (Firefox-plausible baseline; seed-tied hide of extras),
 *   DOM offsetWidth/clientWidth/getBoundingClientRect width fudge.
 * Soft residual (0039): FontFaceSet enumeration coherence — values/keys/entries/
 *   forEach/@@iterator/size/load filtered by the same shouldHideFamily as check;
 *   document.fonts.ready left as host Promise (load-completion, not a font list).
 *   Seed via depth fontSeed (eTLD-effective). Default-on with depth hooks. No Chrome
 *   font-list cosplay.
 * Soft residual (0037): speechSynthesis.getVoices coherence — seed-tied
 *   filter/reorder of host native voices only (no invented Chrome voices).
 *   speechSeed after fontSeed. SpeechRecognition soft/out-of-scope when pref-off.
 * Soft residual (0038): WebGPU adapter/device/limits/features coherence when
 *   navigator.gpu is exposed. webgpuSeed after speechSeed. LibreWolf defaults
 *   dom.webgpu.enabled=false — idle when API absent (no inventing WebGPU /
 *   Chrome adapters). AdapterInfo coherent with depth gpu persona (Firefox/
 *   LibreWolf/Gecko-plausible only).
 * Brand: darkstr — not official LibreWolf.
 *
 * Fission note: this actor runs with chrome privileges while content prototypes
 * live behind Xrays. Always waive the content window and export replacement
 * callables into that page's compartment; assigning chrome functions to Xray
 * prototypes does not stick.
 *
 * 0023 honest subset (WebExt path remains richer):
 *   SPOOFED — UNMASKED vendor/renderer; persona-family MAX_* / viewport / line /
 *             point / anisotropy buckets; OffscreenCanvas convertToBlob +
 *             OffscreenCanvasRenderingContext2D.getImageData noise (when present).
 *   Soft residual (0032): getSupportedExtensions / getExtension (Firefox-plausible,
 *             seed-tied via canvasSeed; list via Cu.cloneInto into pageWindow) +
 *             getShaderPrecisionFormat coherent tiers.
 *   NOT SPOOFED here — fail-closed null for unknown getParameter
 *             (unknown params passthrough to native).
 */

const installedByWindow = new WeakMap();

/**
 * 0057: install-record key = the window's own HTMLCanvasElement.prototype,
 * read through Xrays (page code cannot redirect it). One key per inner
 * window global, whether the actor sees the WindowProxy or the inner window
 * (DOMWindowCreated vs pageshow) and when an initial about:blank inner window
 * is reused for a same-origin document -- so hooks are never stacked twice on
 * the same prototypes (pre-0057: double noise once the sync DOMWindowCreated
 * install and the pageshow install keyed differently).
 */
function installKey(rawWindow) {
  try {
    const proto = rawWindow?.HTMLCanvasElement?.prototype;
    if (proto && typeof proto === "object") {
      return unwaived(proto);
    }
  } catch (_e) {}
  return rawWindow;
}

/** 0057: hooks already live on this window's prototypes. */
function depthHooksInstalled(rawWindow) {
  const prior = installedByWindow.get(installKey(rawWindow));
  return !!(prior && prior.replacements.every(methodIsInstalled));
}

function errorText(error) {
  try {
    return String(error?.stack || error?.message || error || "unknown error");
  } catch (_e) {
    return "unknown error";
  }
}

function contentWindowFor(rawWindow) {
  try {
    const waived = Cu.waiveXrays(rawWindow);
    if (waived) {
      return waived;
    }
  } catch (_e) {}
  try {
    if (rawWindow?.wrappedJSObject) {
      return rawWindow.wrappedJSObject;
    }
  } catch (_e) {}
  throw new Error("unable to obtain waived content window");
}

function pixelNoise(seed, i, val) {
  let h = seed ^ (i * 2654435761);
  h = (h ^ (val * 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  const magnitude = (h >>> 1) & 3;
  return h & 1 ? magnitude : -magnitude;
}

/**
 * 0057: canvas noise for a readout of rectangle (sx, sy, sw, sh) of a cw x ch
 * surface. Keyed by the pixel's ABSOLUTE position on the surface (top-down
 * rows), so every readout path agrees on every pixel: full vs sub-rectangle
 * getImageData, toDataURL / toBlob / convertToBlob (full clone), WebGL
 * readPixels (flipY: GL rows are bottom-up), page vs worker. Only opaque,
 * in-bounds pixels are touched: transparent/semi-transparent pixels would not
 * survive the premultiplied putImageData round trip of the encode paths (and a
 * blank canvas stays blank, like stock). Full-surface reads keep the pre-0057
 * index (i) for opaque pixels.
 */
function applyCanvasNoiseRect(px, seed, sx, sy, sw, sh, cw, ch, flipY) {
  const data = Cu.waiveXrays(px);
  sx = Math.trunc(Number(sx) || 0);
  sy = Math.trunc(Number(sy) || 0);
  sw = Math.trunc(Number(sw) || 0);
  sh = Math.trunc(Number(sh) || 0);
  cw = Math.trunc(Number(cw) || 0);
  ch = Math.trunc(Number(ch) || 0);
  if (sw < 0) {
    sx += sw;
    sw = -sw;
  }
  if (sh < 0) {
    sy += sh;
    sh = -sh;
  }
  if (!sw || !sh || !cw || !ch || data.length < sw * sh * 4) {
    return;
  }
  for (let r = 0; r < sh; r++) {
    const y = sy + r;
    if (y < 0 || y >= ch) {
      continue;
    }
    const ay = flipY ? ch - 1 - y : y;
    for (let c = 0; c < sw; c++) {
      const x = sx + c;
      if (x < 0 || x >= cw) {
        continue;
      }
      const i = (r * sw + c) * 4;
      if (data[i + 3] !== 255) {
        continue;
      }
      const a = (ay * cw + x) * 4;
      data[i] = Math.max(0, Math.min(255, data[i] + pixelNoise(seed, a, data[i])));
      data[i + 1] = Math.max(
        0,
        Math.min(255, data[i + 1] + pixelNoise(seed, a + 1, data[i + 1]))
      );
      data[i + 2] = Math.max(
        0,
        Math.min(255, data[i + 2] + pixelNoise(seed, a + 2, data[i + 2]))
      );
    }
  }
}

/** Whole-surface readout (w x h from 0,0). */
function applyCanvasNoise(px, seed, w, h) {
  applyCanvasNoiseRect(px, seed, 0, 0, w, h, w, h, false);
}

/** getImageData(sx, sy, sw, sh[, settings]) on a context of surface `surf`. */
function noiseImageDataRead(id, seed, args, surf) {
  const w = Number(surf?.width) || 0;
  const h = Number(surf?.height) || 0;
  applyCanvasNoiseRect(Cu.waiveXrays(id).data, seed, args[0], args[1], args[2], args[3], w, h, false);
}

/**
 * 0057: identity across Xray waivers. Values read from a waived prototype are
 * waiver wrappers, while Cu.exportFunction hands back a plain wrapper, so a
 * raw === never matched: "already-installed" and uninstall's restore never
 * fired, and every install event stacked another layer of hooks.
 */
function unwaived(x) {
  try {
    return x && (typeof x === "object" || typeof x === "function")
      ? Cu.unwaiveXrays(x)
      : x;
  } catch (_e) {
    return x;
  }
}

function sameObject(a, b) {
  return a === b || (a != null && b != null && unwaived(a) === unwaived(b));
}

/** 0057: our wrapper (unwaived) -> the descriptor it replaced. */
const ourWrappers = new WeakMap();

function methodIsInstalled(replacement) {
  try {
    const desc = Object.getOwnPropertyDescriptor(
      replacement.proto,
      replacement.name
    );
    if (!desc) {
      return false;
    }
    if (desc.value !== undefined) {
      return sameObject(desc.value, replacement.wrapper);
    }
    if (desc.get !== undefined) {
      return sameObject(desc.get, replacement.wrapper);
    }
    return false;
  } catch (_e) {
    return false;
  }
}

function restoreReplacement(replacement) {
  // Restore only our own wrapper; never clobber a page replacement installed later.
  if (methodIsInstalled(replacement)) {
    Object.defineProperty(
      replacement.proto,
      replacement.name,
      replacement.originalDescriptor
    );
  }
}

function uninstallDepthHooks(rawWindow) {
  const key = installKey(rawWindow);
  const record = installedByWindow.get(key);
  if (!record) {
    return "idle";
  }
  for (const replacement of record.replacements.slice().reverse()) {
    restoreReplacement(replacement);
  }
  installedByWindow.delete(key);
  return "uninstalled";
}

/**
 * 0057r3: WebGPU page/worker body (byte-identical in DarkstrWorkerHooksChild;
 * tests/depth-per-site-0057 checks). Runs in the page / worker global with
 * (seed, gpuVendor, gpuRenderer); returns the requestAdapter hook record.
 */
const WEBGPU_BODY = `"use strict";
// 0057r3 (Proof 0057r2): WebGPU keeps its native objects. Limits and device
// features are the real ones; adapter features are the real setlike (an Intel
// persona hides only the Apple-silicon-only texture formats); AdapterInfo is the
// persona's. Canvas exports of WebGPU canvases stay unfarbled (DepthHooksChild /
// worker prelude), so canvas and buffer readback agree.
var VENDOR = String(gpuVendor || "Apple");
var RENDERER = String(gpuRenderer || "Apple M1");
var hooks = { requestAdapter: null, origRequestAdapter: null, gpuProto: null };
var gpuObj = null;
try {
  if (typeof navigator !== "undefined" && navigator && navigator.gpu) {
    gpuObj = navigator.gpu;
  }
} catch (_e) {}
if (!gpuObj) { return hooks; }
// WebGL persona -> Firefox-plausible AdapterInfo. Never Chrome/ANGLE brands.
function mapAdapterInfo() {
  var v = VENDOR.toLowerCase();
  var r = String(RENDERER || "");
  if (/apple/i.test(v) || /apple/i.test(r)) {
    return { vendor: "apple", architecture: "common-3", device: "", description: r || "Apple GPU" };
  }
  if (/intel/i.test(v) || /intel/i.test(r)) {
    return { vendor: "intel", architecture: "gen-12lp", device: "", description: r || "Intel Graphics" };
  }
  if (/nvidia/i.test(v) || /nvidia/i.test(r)) {
    return { vendor: "nvidia", architecture: "gpu", device: "", description: r || "NVIDIA GPU" };
  }
  if (/amd/i.test(v) || /radeon/i.test(r)) {
    return { vendor: "amd", architecture: "gcn", device: "", description: r || "AMD GPU" };
  }
  return { vendor: "apple", architecture: "common-3", device: "", description: r || "Apple GPU" };
}
var PERSONA_INFO = mapAdapterInfo();
// Metal texture formats only Apple-silicon GPUs have. A non-Apple persona hides
// them so the feature set is one its renderer could report. Nothing is ever
// added; every other feature and every limit is the host's own.
var APPLE_SILICON_ONLY_FEATURES = {
  "texture-compression-astc": 1,
  "texture-compression-astc-sliced-3d": 1,
  "texture-compression-etc2": 1
};
var HIDDEN_FEATURES = PERSONA_INFO.vendor === "apple" ? null : APPLE_SILICON_ONLY_FEATURES;
var featureViews = new WeakMap();
function named(fn, name) {
  try { Object.defineProperty(fn, "name", { configurable: true, value: name }); } catch (_n) {}
  return fn;
}
function wrapFeatures(nativeFeatures) {
  if (!nativeFeatures || typeof nativeFeatures !== "object" || !HIDDEN_FEATURES) {
    return nativeFeatures;
  }
  var known = featureViews.get(nativeFeatures);
  if (known) { return known; }
  var visible = new Set();
  var hidden = false;
  try {
    nativeFeatures.forEach(function(name) {
      name = String(name);
      if (HIDDEN_FEATURES[name] === 1) { hidden = true; } else { visible.add(name); }
    });
  } catch (_e) {
    return nativeFeatures;
  }
  if (!hidden) {
    featureViews.set(nativeFeatures, nativeFeatures);
    return nativeFeatures;
  }
  // Proxy over the real GPUSupportedFeatures: instanceof, toStringTag and
  // prototype stay native; the setlike members read a real Set (Set iterators,
  // native-looking bound functions; keys === values === @@iterator).
  var values = named(visible.values.bind(visible), "values");
  var own = {
    has: named(visible.has.bind(visible), "has"),
    values: values,
    keys: values,
    entries: named(visible.entries.bind(visible), "entries"),
    forEach: named(visible.forEach.bind(visible), "forEach")
  };
  var view = new Proxy(nativeFeatures, {
    get: function(target, prop) {
      if (prop === Symbol.iterator) { return values; }
      if (prop === "size") { return visible.size; }
      if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(own, prop)) {
        return own[prop];
      }
      return Reflect.get(target, prop, target);
    }
  });
  featureViews.set(nativeFeatures, view);
  return view;
}
function wrapInfo(nativeInfo) {
  // Plain object (a Proxy(GPUAdapterInfo) is Xray-transparent to Marionette).
  var out = {
    vendor: String(PERSONA_INFO.vendor || ""),
    architecture: String(PERSONA_INFO.architecture || ""),
    device: String(PERSONA_INFO.device || ""),
    description: String(PERSONA_INFO.description || "")
  };
  try {
    if (nativeInfo && typeof nativeInfo.isFallbackAdapter === "boolean") {
      out.isFallbackAdapter = nativeInfo.isFallbackAdapter;
    }
    if (nativeInfo && typeof nativeInfo.subgroupMinSize === "number") {
      out.subgroupMinSize = nativeInfo.subgroupMinSize;
    }
    if (nativeInfo && typeof nativeInfo.subgroupMaxSize === "number") {
      out.subgroupMaxSize = nativeInfo.subgroupMaxSize;
    }
  } catch (_e) {}
  return out;
}
function overlayDeviceInfo(device, info) {
  // Device features / limits stay native (what was granted). Only adapterInfo
  // follows the adapter's persona info.
  try {
    if (device && "adapterInfo" in device) {
      Object.defineProperty(device, "adapterInfo", {
        configurable: true, enumerable: true, get: function() { return info; }
      });
    }
  } catch (_e) {}
  return device;
}
var wrappedAdapters = new WeakMap();
function wrapAdapter(adapter) {
  if (!adapter) { return adapter; }
  var known = wrappedAdapters.get(adapter);
  if (known) { return known; }
  var featCache = null;
  var infoCache = null;
  var requestDevice = null;
  function getFeat() {
    if (!featCache) { featCache = wrapFeatures(adapter.features); }
    return featCache;
  }
  function getInfo() {
    if (!infoCache) { infoCache = wrapInfo(adapter.info); }
    return infoCache;
  }
  var proxy = new Proxy(adapter, {
    get: function(target, prop) {
      if (typeof prop === "symbol") { return Reflect.get(target, prop, target); }
      if (prop === "features") { return getFeat(); }
      if (prop === "info") { return getInfo(); }
      if (prop === "requestDevice") {
        if (!requestDevice) {
          var origRD = target.requestDevice;
          requestDevice = named(function() {
            var desc = arguments[0];
            var feats = getFeat();
            if (feats !== target.features && desc && desc.requiredFeatures) {
              var req;
              try { req = Array.from(desc.requiredFeatures, String); } catch (_r) { req = []; }
              for (var i = 0; i < req.length; i++) {
                if (!feats.has(req[i])) {
                  return Promise.reject(new TypeError(
                    "GPUAdapter.requestDevice: feature '" + req[i] + "' is not supported by the adapter"
                  ));
                }
              }
            }
            return Promise.resolve(origRD.apply(target, arguments)).then(function(dev) {
              return overlayDeviceInfo(dev, getInfo());
            });
          }, "requestDevice");
        }
        return requestDevice;
      }
      var raw;
      try { raw = target[prop]; } catch (_e) { return undefined; }
      if (typeof raw === "function") { return raw.bind(target); }
      return raw;
    }
  });
  wrappedAdapters.set(adapter, proxy);
  return proxy;
}
var gpuProto = Object.getPrototypeOf(gpuObj);
if (!gpuProto && typeof GPU !== "undefined" && GPU.prototype) {
  gpuProto = GPU.prototype;
}
if (gpuProto && typeof gpuProto.requestAdapter === "function") {
  var origRA = gpuProto.requestAdapter;
  var wrappedRA = named(function() {
    return Promise.resolve(origRA.apply(this, arguments)).then(function(adapter) {
      if (!adapter) { return null; }
      return wrapAdapter(adapter);
    });
  }, "requestAdapter");
  Object.defineProperty(gpuProto, "requestAdapter", {
    configurable: true, enumerable: true, writable: true, value: wrappedRA
  });
  hooks.requestAdapter = wrappedRA;
  hooks.origRequestAdapter = origRA;
  hooks.gpuProto = gpuProto;
}
return hooks;
`;

function replaceMethod(pageWindow, proto, name, implementation, replacements) {
  let descriptor = Object.getOwnPropertyDescriptor(proto, name);
  // 0057: never wrap one of our own wrappers (no stacked noise, whatever the
  // install bookkeeping says): start from the descriptor it replaced.
  for (
    let i = 0;
    i < 8 &&
    descriptor &&
    typeof descriptor.value === "function" &&
    ourWrappers.has(unwaived(descriptor.value));
    i++
  ) {
    descriptor = ourWrappers.get(unwaived(descriptor.value));
  }
  if (!descriptor || typeof descriptor.value !== "function") {
    throw new Error(`${name} native descriptor unavailable`);
  }
  const wrapper = Cu.exportFunction(implementation, pageWindow);
  ourWrappers.set(unwaived(wrapper), descriptor);
  Object.defineProperty(proto, name, { ...descriptor, value: wrapper });
  replacements.push({
    proto,
    name,
    wrapper,
    originalDescriptor: descriptor,
  });
  return descriptor.value;
}


// Phase 1 webgl.js GL_CAP_BUCKETS parity — persona GPU family only (honest subset).
// Cap enums: MAX_TEXTURE_SIZE / MAX_CUBE_MAP_TEXTURE_SIZE / MAX_RENDERBUFFER_SIZE /
// MAX_VERTEX_ATTRIBS / MAX_TEXTURE_IMAGE_UNITS / MAX_VERTEX_TEXTURE_IMAGE_UNITS /
// MAX_COMBINED_TEXTURE_IMAGE_UNITS / MAX_FRAGMENT_UNIFORM_VECTORS /
// MAX_VARYING_VECTORS / MAX_VERTEX_UNIFORM_VECTORS (+ array ranges below).
const GL_CAP_BUCKETS = {
  apple: {
    0x0d33: 16384,
    0x851c: 16384,
    0x84e8: 16384,
    0x8869: 16,
    0x8872: 4096,
    0x8b4c: 16,
    0x8871: 30,
    0x8824: 1024,
    0x8b4d: 16,
    0x8b4a: 32,
    viewportDims: [16384, 16384],
    lineWidthRange: [1, 1],
    pointSizeRange: [1, 255],
    maxAnisotropy: 16,
  },
  intel_low: {
    0x0d33: 16384,
    0x851c: 16384,
    0x84e8: 16384,
    0x8869: 16,
    0x8872: 4096,
    0x8b4c: 16,
    0x8871: 30,
    0x8824: 1024,
    0x8b4d: 16,
    0x8b4a: 32,
    viewportDims: [16384, 16384],
    lineWidthRange: [1, 7.375],
    pointSizeRange: [1, 255],
    maxAnisotropy: 16,
  },
  intel_mid: {
    0x0d33: 16384,
    0x851c: 16384,
    0x84e8: 16384,
    0x8869: 16,
    0x8872: 4096,
    0x8b4c: 16,
    0x8871: 30,
    0x8824: 1024,
    0x8b4d: 16,
    0x8b4a: 32,
    viewportDims: [32767, 32767],
    lineWidthRange: [1, 7.375],
    pointSizeRange: [1, 255],
    maxAnisotropy: 16,
  },
  nvidia_mid: {
    0x0d33: 16384,
    0x851c: 16384,
    0x84e8: 16384,
    0x8869: 16,
    0x8872: 4096,
    0x8b4c: 16,
    0x8871: 32,
    0x8824: 1024,
    0x8b4d: 16,
    0x8b4a: 32,
    viewportDims: [32767, 32767],
    lineWidthRange: [1, 1],
    pointSizeRange: [1, 1024],
    maxAnisotropy: 16,
  },
  nvidia_high: {
    0x0d33: 32768,
    0x851c: 32768,
    0x84e8: 32768,
    0x8869: 16,
    0x8872: 4096,
    0x8b4c: 16,
    0x8871: 32,
    0x8824: 1024,
    0x8b4d: 16,
    0x8b4a: 32,
    viewportDims: [32767, 32767],
    lineWidthRange: [1, 1],
    pointSizeRange: [1, 1024],
    maxAnisotropy: 16,
  },
};

// 0057r4: Gecko's WebGL renderer sanitizer (dom/canvas/SanitizeRenderer.cpp,
// Firefox 156) ported 1:1. A persona's RENDERER and UNMASKED_RENDERER_WEBGL are
// what Gecko reports for that GPU's raw GL_RENDERER: the same bucket plus the
// ", or similar" suffix. Byte-identical in DarkstrDepthHooksChild and
// DarkstrWorkerHooksChild (tests/webgl-renderer-0057r4 checks).
function geckoChooseDeviceReplacement(str) {
  str = String(str);
  if (str.indexOf("llvmpipe") === 0) return "llvmpipe";
  if (str.indexOf("Apple") === 0) return "Apple M1";
  let m;
  const has = (part) => str.indexOf(part) !== -1;
  // AMD
  const RADEON_HD_3000 = "Radeon HD 3200 Graphics";
  const RADEON_HD_5850 = "Radeon HD 5850";
  const RADEON_R9_290 = "Radeon R9 200 Series";
  if (has("REMBRANDT") || has("RENOIR") || has("Vega") || has("VII") || has("Fury")) {
    return RADEON_R9_290;
  }
  m = /Radeon.*?((R[579X]|HD) )?([0-9][0-9][0-9]+)/.exec(str);
  if (m) {
    const modelNum = parseInt(m[3], 10);
    if ((m[2] || "") === "HD") {
      if (modelNum >= 5000) return RADEON_HD_5850;
      return RADEON_HD_3000;
    }
    return RADEON_R9_290;
  }
  m = /FirePro.*?([VDW])[0-9][0-9][0-9]+/.exec(str);
  if (m) return m[1] === "V" ? RADEON_HD_3000 : RADEON_R9_290;
  if (has("ARUBA")) return RADEON_HD_5850;
  if (has("AMD ") || has("FirePro") || has("Radeon")) return RADEON_HD_3000;
  // NVIDIA
  const GEFORCE_8800 = "GeForce 8800 GTX";
  const GEFORCE_480 = "GeForce GTX 480";
  const GEFORCE_980 = "GeForce GTX 980";
  if (has("NVIDIA") || has("GeForce") || has("Quadro")) {
    let ret = GEFORCE_8800;
    if ((m = /GeForce.*?([0-9][0-9][0-9]+)/.exec(str))) {
      const modelNum = parseInt(m[1], 10);
      if (modelNum >= 8000) ret = GEFORCE_8800;
      else if (modelNum >= 900) ret = GEFORCE_980;
      else if (modelNum >= 400) ret = GEFORCE_480;
      else ret = GEFORCE_8800;
    } else if ((m = /Quadro.*?([KMPVT]?)[0-9][0-9][0-9]+/.exec(str))) {
      if (has("RTX")) ret = GEFORCE_980;
      else if (m[1]) ret = "MPVT".indexOf(m[1]) !== -1 ? GEFORCE_980 : GEFORCE_480;
      else ret = GEFORCE_8800;
    } else if ((m = /TITAN( [BZXVR])?/.exec(str))) {
      const letter = m[1] ? m[1][1] : " ";
      ret = letter === " " || letter === "B" || letter === "Z" ? GEFORCE_480 : GEFORCE_980;
    }
    if (str.indexOf("NVIDIA") === 0) ret = "NVIDIA " + ret;
    return ret;
  }
  if ((m = /^NV(1?[0-9A-F][0-9A-F])$/.exec(str))) {
    const modelNum = parseInt(m[1], 16);
    if (modelNum >= 0x120) return GEFORCE_980;
    if (modelNum >= 0xc0) return GEFORCE_480;
    return GEFORCE_8800;
  }
  // Intel
  if (has("Intel")) {
    if (has("Intel(R) Arc(TM)")) return "Intel(R) Arc(TM) A750 Graphics";
    if ((m = /Intel.*Graphics( P?([0-9][0-9][0-9]+))?/.exec(str))) {
      if (!m[1]) return "Intel(R) HD Graphics";
      const modelNum = parseInt(m[2], 10);
      if (modelNum >= 5000) return "Intel(R) HD Graphics 400";
      if (modelNum >= 1000) return "Intel(R) HD Graphics";
      return "Intel(R) HD Graphics 400";
    }
    return "Intel 945GM";
  }
  if ((m = /Adreno.*?([A-Z]?[0-9]-?[0-9]+)/.exec(str))) {
    const modelName = m[1];
    if (modelName[0] === "A") return "Adreno (TM) A11";
    if (modelName[0] === "X") return "Adreno (TM) X1-45";
    const modelNum = parseInt(modelName, 10);
    if (modelNum >= 600) return "Adreno (TM) 650";
    if (modelNum >= 500) return "Adreno (TM) 540";
    if (modelNum >= 400) return "Adreno (TM) 430";
    if (modelNum >= 300) return "Adreno (TM) 330";
    return "Adreno (TM) 225";
  }
  if ((m = /Mali.*?([0-9][0-9]+)/.exec(str))) {
    const modelNum = parseInt(m[1], 10);
    if (modelNum >= 800) return "Mali-T880";
    if (modelNum >= 700) return "Mali-T760";
    if (modelNum >= 600) return "Mali-T628";
    if (modelNum >= 400) return "Mali-400 MP";
    return "Mali-G51";
  }
  if (has("PowerVR")) return has("Rogue") ? "PowerVR Rogue G6200" : "PowerVR SGX 540";
  if (has("Samsung Xclipse")) return "Samsung Xclipse 920";
  if (has("Vivante")) return "Vivante GC1000";
  if (has("VideoCore")) return "VideoCore IV HW";
  if (has("Tegra")) return "NVIDIA Tegra";
  if (has("Microsoft Basic Render Driver")) return str;
  return null;
}

export function geckoSanitizeRenderer(rawRenderer) {
  const raw = String(rawRenderer);
  const GENERIC_RENDERER = "Generic Renderer";
  const device = (() => {
    let m;
    if ((m = /^ANGLE [(]([^,]*), ([^,]*)( Direct3D[^,]*), .*[)]$/.exec(raw))) {
      const r2 = geckoChooseDeviceReplacement(m[2]) || GENERIC_RENDERER;
      return "ANGLE (" + m[1] + ", " + r2 + m[3] + ")";
    }
    if ((m = /^ANGLE [(]+(.*)[)]( on Vulkan) [0-9.]*[)]*$/.exec(raw))) {
      const r2 = geckoChooseDeviceReplacement(m[1]) || GENERIC_RENDERER;
      return "ANGLE (" + r2 + ")" + m[2];
    }
    if ((m = /^ANGLE [(]([^,]*), ANGLE Metal Renderer: ([^,]*), Version .*[)]$/.exec(raw))) {
      const r2 = geckoChooseDeviceReplacement(m[2]) || GENERIC_RENDERER;
      return "ANGLE (" + m[1] + ", ANGLE Metal Renderer: " + r2 + ")";
    }
    if (raw.indexOf("ANGLE") !== -1) return null;
    if ((m = /^(.*) OpenGL Engine$/.exec(raw))) return geckoChooseDeviceReplacement(m[1]);
    if ((m = /^(.*)(\/PCIe?\/SSE2)$/.exec(raw))) return geckoChooseDeviceReplacement(m[1]);
    if ((m = /^(.*)( [(].*[)])$/.exec(raw))) return geckoChooseDeviceReplacement(m[1]);
    return geckoChooseDeviceReplacement(raw);
  })();
  if (!device) return GENERIC_RENDERER;
  return device + ", or similar";
}

/** webgl.sanitize-unmasked-renderer (Gecko default true). */
export function sanitizeUnmaskedPref() {
  try {
    const prefs = globalThis.Services?.prefs;
    if (!prefs?.getBoolPref) return true;
    return prefs.getBoolPref("webgl.sanitize-unmasked-renderer", true) !== false;
  } catch (_e) {
    return true;
  }
}

/**
 * RENDERER (0x1F01) / UNMASKED_VENDOR_WEBGL (0x9245) / UNMASKED_RENDERER_WEBGL
 * (0x9246) for a persona GPU, given what stock returned for the same call.
 * Stock non-strings (no WEBGL_debug_renderer_info: null + INVALID_ENUM) and
 * RFP constants ("Mozilla...") pass through; VENDOR (0x1F00) is never touched
 * (stock "Mozilla").
 */
export function personaGlString(param, native, gpu, sanitizeUnmasked = true) {
  if (typeof native !== "string" || native.indexOf("Mozilla") === 0) return native;
  if (param === 0x9245) return String(gpu?.vendor || "Apple");
  const raw = String(gpu?.renderer || "Apple M1");
  if (param === 0x1f01) return geckoSanitizeRenderer(raw);
  return sanitizeUnmasked ? geckoSanitizeRenderer(raw) : raw;
}

function getCapBucket(renderer) {
  const r = String(renderer || "");
  if (/Apple\s+M[12]/.test(r)) {
    return GL_CAP_BUCKETS.apple;
  }
  if (/Iris.*Plus/.test(r)) {
    return GL_CAP_BUCKETS.apple;
  }
  if (/HD\s+Graphics\s+6[12]0/.test(r)) {
    return GL_CAP_BUCKETS.intel_low;
  }
  if (/UHD\s+Graphics|Iris.*Xe/.test(r)) {
    return GL_CAP_BUCKETS.intel_mid;
  }
  if (/RTX\s+4/.test(r)) {
    return GL_CAP_BUCKETS.nvidia_high;
  }
  // GTX, RTX 3xxx, AMD RX → nvidia_mid (shared mid-range discrete bucket)
  return GL_CAP_BUCKETS.nvidia_mid;
}

function installDepthHooks(rawWindow, seeds, onRuntimeError) {
  const key = installKey(rawWindow);
  const prior = installedByWindow.get(key);
  if (prior && prior.replacements.every(methodIsInstalled)) {
    return "already-installed";
  }
  if (prior) {
    uninstallDepthHooks(rawWindow);
  }

  const pageWindow = contentWindowFor(rawWindow);
  const canvasSeed = seeds.canvasSeed >>> 0;
  const audioSeed = seeds.audioSeed >>> 0;
  // Soft residual (0036): fontSeed from depth plan; stable fallback if older plan.
  const fontSeed =
    typeof seeds.fontSeed === "number"
      ? seeds.fontSeed >>> 0
      : (canvasSeed ^ Math.imul(audioSeed, 0x9e3779b9)) >>> 0;
  // Soft residual (0037): speechSeed after fontSeed; stable XOR fallback.
  const speechSeed =
    typeof seeds.speechSeed === "number"
      ? seeds.speechSeed >>> 0
      : (fontSeed ^ Math.imul(canvasSeed, 0x85ebca6b)) >>> 0;
  // Soft residual (0038): webgpuSeed after speechSeed; stable XOR fallback.
  const webgpuSeed =
    typeof seeds.webgpuSeed === "number"
      ? seeds.webgpuSeed >>> 0
      : (speechSeed ^ Math.imul(audioSeed, 0xc2b2ae35)) >>> 0;
  const gpu = seeds.gpu || { vendor: "Apple", renderer: "Apple M1" };
  const sanitizeUnmasked = sanitizeUnmaskedPref();
  const replacements = [];

  try {
    const doc = pageWindow.document;
    const HTMLCanvasElement = pageWindow.HTMLCanvasElement;
    const CanvasRenderingContext2D = pageWindow.CanvasRenderingContext2D;
    if (!doc || !HTMLCanvasElement || !CanvasRenderingContext2D) {
      throw new Error("Canvas 2D constructors unavailable");
    }

    const canvasProto = HTMLCanvasElement.prototype;
    const canvas2dProto = CanvasRenderingContext2D.prototype;
    const origToDataURL = Object.getOwnPropertyDescriptor(
      canvasProto,
      "toDataURL"
    )?.value;
    const origToBlob = Object.getOwnPropertyDescriptor(canvasProto, "toBlob")?.value;
    const origGetImageData = Object.getOwnPropertyDescriptor(
      canvas2dProto,
      "getImageData"
    )?.value;
    if (!origToDataURL || !origToBlob || !origGetImageData) {
      throw new Error("Canvas 2D native methods unavailable");
    }

    // 0057r3: canvases with a WebGPU context keep native exports. WebGPU
    // buffer / compute readback of the same texture cannot be farbled without
    // corrupting compute results, so farbling the canvas exports alone would
    // make the two paths disagree (Proof 0057r2). Recorded by getContext below.
    const webgpuCanvases = new WeakSet();
    const isWebGpuCanvas = (c) => {
      try {
        return webgpuCanvases.has(unwaived(c));
      } catch (_e) {
        return false;
      }
    };

    function noisyClone(src) {
      const c = doc.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const cctx = c.getContext("2d");
      cctx.drawImage(src, 0, 0);
      const id = Reflect.apply(origGetImageData, cctx, [0, 0, c.width, c.height]);
      applyCanvasNoise(Cu.waiveXrays(id).data, canvasSeed, c.width, c.height);
      cctx.putImageData(id, 0, 0);
      return c;
    }

    replaceMethod(
      pageWindow,
      canvasProto,
      "toDataURL",
      function (...args) {
        try {
          if (this.width > 0 && this.height > 0 && !isWebGpuCanvas(this)) {
            return Reflect.apply(origToDataURL, noisyClone(this), args);
          }
        } catch (error) {
          onRuntimeError("canvas.toDataURL", error);
        }
        return Reflect.apply(origToDataURL, this, args);
      },
      replacements
    );

    replaceMethod(
      pageWindow,
      canvasProto,
      "toBlob",
      function (callback, ...args) {
        try {
          if (this.width > 0 && this.height > 0 && !isWebGpuCanvas(this)) {
            return Reflect.apply(origToBlob, noisyClone(this), [callback, ...args]);
          }
        } catch (error) {
          onRuntimeError("canvas.toBlob", error);
        }
        return Reflect.apply(origToBlob, this, [callback, ...args]);
      },
      replacements
    );

    replaceMethod(
      pageWindow,
      canvas2dProto,
      "getImageData",
      function (...args) {
        const id = Reflect.apply(origGetImageData, this, args);
        try {
          noiseImageDataRead(id, canvasSeed, args, this.canvas);
        } catch (error) {
          onRuntimeError("canvas.getImageData", error);
        }
        return id;
      },
      replacements
    );

    // WebGL: UNMASKED vendor/renderer + persona GPU cap buckets + readPixels noise
    // + Soft residual (0032) getSupportedExtensions/getExtension + getShaderPrecisionFormat.
    // Firefox/LibreWolf/Gecko persona only — no Chrome-only extension names.
    // Extension advertise list + precision tiers are seed-tied (canvasSeed / eTLD-effective).
    const activeGlCaps = getCapBucket(gpu.renderer);
    // Firefox-plausible WebGL1 baseline (Phase 1 webgl.js parity). WebGL2 intersection
    // drops core-promoted names automatically. Never invent Chrome-only extensions.
    const BASELINE_WEBGL_EXTENSIONS = [
      "ANGLE_instanced_arrays",
      "EXT_blend_minmax",
      "EXT_color_buffer_half_float",
      "EXT_float_blend",
      "EXT_frag_depth",
      "EXT_shader_texture_lod",
      "EXT_texture_filter_anisotropic",
      "OES_element_index_uint",
      "OES_standard_derivatives",
      "OES_texture_float",
      "OES_texture_float_linear",
      "OES_texture_half_float",
      "OES_texture_half_float_linear",
      "OES_vertex_array_object",
      "WEBGL_color_buffer_float",
      "WEBGL_compressed_texture_s3tc",
      "WEBGL_debug_renderer_info",
      "WEBGL_depth_texture",
      "WEBGL_draw_buffers",
      "WEBGL_lose_context",
    ];
    // 0057r4: WEBGL_debug_renderer_info is never stubbed: advertised only when
    // native has it, and getExtension hands back the native object, which also
    // enables the extension so UNMASKED_* answer like stock (Proof #88 r3 5a).
    const STUBBED_EXTENSIONS = new Set([
      "EXT_texture_filter_anisotropic",
    ]);
    // Always keep when native/stub allows — coherent Apple/Firefox surface.
    const CORE_EXTENSIONS = new Set([
      "WEBGL_debug_renderer_info",
      "EXT_texture_filter_anisotropic",
      "WEBGL_lose_context",
      "OES_vertex_array_object",
      "OES_element_index_uint",
      "OES_standard_derivatives",
      "WEBGL_depth_texture",
      "WEBGL_draw_buffers",
      "EXT_float_blend",
      "WEBGL_color_buffer_float",
      "ANGLE_instanced_arrays",
    ]);
    // Seed-optional: Brave-like deterministic keep/drop for cross-eTLD divergence.
    const OPTIONAL_EXTENSIONS = new Set([
      "EXT_blend_minmax",
      "EXT_color_buffer_half_float",
      "EXT_frag_depth",
      "EXT_shader_texture_lod",
      "OES_texture_float",
      "OES_texture_float_linear",
      "OES_texture_half_float",
      "OES_texture_half_float_linear",
      "WEBGL_compressed_texture_s3tc",
    ]);
    function seedKeepsExtension(name, seed) {
      let h = seed >>> 0;
      for (let i = 0; i < name.length; i++) {
        h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
      }
      h = (h ^ (h >>> 16)) >>> 0;
      // Bias toward keep (~75%) so golden surfaces stay richly coherent.
      return (h % 4) !== 0;
    }
    function advertisedExtensions(nativeList, seed) {
      const native = new Set(nativeList || []);
      const out = [];
      for (const ext of BASELINE_WEBGL_EXTENSIONS) {
        const allowed =
          STUBBED_EXTENSIONS.has(ext) || native.has(ext);
        if (!allowed) {
          continue;
        }
        if (CORE_EXTENSIONS.has(ext) || !OPTIONAL_EXTENSIONS.has(ext)) {
          out.push(ext);
          continue;
        }
        if (seedKeepsExtension(ext, seed)) {
          out.push(ext);
        }
      }
      return out;
    }
    // Firefox-desktop coherent precision profiles (Apple M1/M2 class). Seed picks
    // one profile — both are internally coherent (no impossible mantissa/range).
    const PRECISION_PROFILES = [
      {
        // Common Firefox Mac / Metal path: highp floats across tiers.
        0x8df0: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df1: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df2: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df3: { rangeMin: 7, rangeMax: 7, precision: 0 },
        0x8df4: { rangeMin: 15, rangeMax: 14, precision: 0 },
        0x8df5: { rangeMin: 31, rangeMax: 30, precision: 0 },
      },
      {
        // Also-plausible desktop ES-ish ints; floats remain highp.
        0x8df0: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df1: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df2: { rangeMin: 127, rangeMax: 127, precision: 23 },
        0x8df3: { rangeMin: 8, rangeMax: 8, precision: 0 },
        0x8df4: { rangeMin: 16, rangeMax: 16, precision: 0 },
        0x8df5: { rangeMin: 24, rangeMax: 24, precision: 0 },
      },
    ];
    const precisionProfile =
      PRECISION_PROFILES[(canvasSeed >>> 0) % PRECISION_PROFILES.length];
    const extListByContext = new WeakMap();
    function patchWebGL(proto, label) {
      if (!proto) {
        return;
      }
      const origGetParameter = Object.getOwnPropertyDescriptor(
        proto,
        "getParameter"
      )?.value;
      if (origGetParameter) {
        replaceMethod(
          pageWindow,
          proto,
          "getParameter",
          function (param) {
            if (param === 0x1f01 || param === 0x9245 || param === 0x9246) {
              // 0057r4: stock first (null + INVALID_ENUM without the
              // extension, "Mozilla" under RFP), then the persona's string
              // as Gecko reports it (sanitized RENDERER / UNMASKED_*).
              return personaGlString(
                param,
                Reflect.apply(origGetParameter, this, [param]),
                gpu,
                sanitizeUnmasked
              );
            }
            if (Object.prototype.hasOwnProperty.call(activeGlCaps, param)) {
              return activeGlCaps[param];
            }
            if (param === 0x0d3d) {
              // MAX_VIEWPORT_DIMS
              return new pageWindow.Int32Array(activeGlCaps.viewportDims);
            }
            if (param === 0x846e) {
              // ALIASED_LINE_WIDTH_RANGE
              return new pageWindow.Float32Array(activeGlCaps.lineWidthRange);
            }
            if (param === 0x8460) {
              // ALIASED_POINT_SIZE_RANGE
              return new pageWindow.Float32Array(activeGlCaps.pointSizeRange);
            }
            if (param === 0x84ff) {
              // MAX_TEXTURE_MAX_ANISOTROPY_EXT
              return activeGlCaps.maxAnisotropy;
            }
            return Reflect.apply(origGetParameter, this, [param]);
          },
          replacements
        );
      }
      const origReadPixels = Object.getOwnPropertyDescriptor(proto, "readPixels")?.value;
      if (origReadPixels) {
        replaceMethod(
          pageWindow,
          proto,
          "readPixels",
          function (x, y, w, h, format, type, pixels) {
            const result = Reflect.apply(origReadPixels, this, [
              x,
              y,
              w,
              h,
              format,
              type,
              pixels,
            ]);
            if (
              pixels &&
              typeof pixels === "object" &&
              arguments.length <= 7 &&
              format === 0x1908 /* RGBA */ &&
              type === 0x1401 /* UNSIGNED_BYTE */
            ) {
              // 0057: GL rows are bottom-up; key noise by the canvas pixel.
              try {
                applyCanvasNoiseRect(
                  pixels,
                  canvasSeed,
                  x,
                  y,
                  w,
                  h,
                  this.drawingBufferWidth,
                  this.drawingBufferHeight,
                  true
                );
              } catch (error) {
                onRuntimeError("webgl.readPixels", error);
              }
            }
            return result;
          },
          replacements
        );
      }
      // Soft residual (0032): seed-tied extension list + shader precision.
      const origGetSupported = Object.getOwnPropertyDescriptor(
        proto,
        "getSupportedExtensions"
      )?.value;
      const origGetExtension = Object.getOwnPropertyDescriptor(
        proto,
        "getExtension"
      )?.value;
      const origGetShaderPrecision = Object.getOwnPropertyDescriptor(
        proto,
        "getShaderPrecisionFormat"
      )?.value;
      if (origGetSupported) {
        replaceMethod(
          pageWindow,
          proto,
          "getSupportedExtensions",
          function () {
            let cached = extListByContext.get(this);
            if (!cached) {
              const nativeList = Reflect.apply(origGetSupported, this, []) || [];
              cached = advertisedExtensions(
                nativeList,
                canvasSeed >>> 0
              );
              extListByContext.set(this, cached);
            }
            // Page-compartment Array (0032): exportFunction + chrome Array denies
            // .length / index to page principal. cloneInto matches langs 0033 lesson.
            try {
              return Cu.cloneInto(cached, pageWindow);
            } catch (_e) {
              try {
                return pageWindow.Array.from(Cu.cloneInto(cached, pageWindow));
              } catch (_e2) {
                return cached.slice();
              }
            }
          },
          replacements
        );
      }
      if (origGetExtension) {
        replaceMethod(
          pageWindow,
          proto,
          "getExtension",
          function (name) {
            const want = String(name || "");
            let advertised = extListByContext.get(this);
            if (!advertised) {
              const nativeList = origGetSupported
                ? Reflect.apply(origGetSupported, this, []) || []
                : [];
              advertised = advertisedExtensions(nativeList, canvasSeed >>> 0);
              extListByContext.set(this, advertised);
            }
            if (!advertised.includes(want)) {
              return null;
            }
            if (want === "WEBGL_debug_renderer_info") {
              // 0057r4: the native WebGLDebugRendererInfo (enables the
              // extension); never a plain-object stub.
              return Reflect.apply(origGetExtension, this, [want]);
            }
            if (want === "EXT_texture_filter_anisotropic") {
              // Prefer native object when present; else coherent stub (MAX=16).
              if (origGetSupported) {
                const nativeSet = new Set(
                  Reflect.apply(origGetSupported, this, []) || []
                );
                if (nativeSet.has(want)) {
                  return Reflect.apply(origGetExtension, this, [want]);
                }
              }
              return Cu.cloneInto(
                {
                  TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
                  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
                },
                pageWindow
              );
            }
            return Reflect.apply(origGetExtension, this, [want]);
          },
          replacements
        );
      }
      if (origGetShaderPrecision) {
        replaceMethod(
          pageWindow,
          proto,
          "getShaderPrecisionFormat",
          function (shaderType, precisionType) {
            const real = Reflect.apply(origGetShaderPrecision, this, [
              shaderType,
              precisionType,
            ]);
            if (!real) {
              return real;
            }
            const tier =
              precisionProfile[precisionType] || precisionProfile[0x8df2];
            try {
              const waived = Cu.waiveXrays(real);
              Object.defineProperty(waived, "rangeMin", {
                value: tier.rangeMin,
                writable: false,
                enumerable: true,
                configurable: true,
              });
              Object.defineProperty(waived, "rangeMax", {
                value: tier.rangeMax,
                writable: false,
                enumerable: true,
                configurable: true,
              });
              Object.defineProperty(waived, "precision", {
                value: tier.precision,
                writable: false,
                enumerable: true,
                configurable: true,
              });
            } catch (_e) {
              // If the platform freezes the object, return native (still coherent).
            }
            return real;
          },
          replacements
        );
      }
      if (!origGetParameter && !origReadPixels) {
        throw new Error(`${label} native methods unavailable`);
      }
    }
    if (pageWindow.WebGLRenderingContext) {
      patchWebGL(pageWindow.WebGLRenderingContext.prototype, "WebGL1");
    }
    if (pageWindow.WebGL2RenderingContext) {
      patchWebGL(pageWindow.WebGL2RenderingContext.prototype, "WebGL2");
    }

    // OffscreenCanvas window parity with HTMLCanvasElement depth (Phase 1 webgl.js).
    // Soft-optional: missing constructors skip without failing install.
    // 0057r3: convertToBlob exports a noisy clone drawn from the canvas itself
    // (like noisyClone), so 2D, WebGL and bitmaprenderer OffscreenCanvases all
    // export what getImageData / readPixels report (0057r2 had WebGL exporting
    // real pixels, and created a 2D context on canvases that had none).
    if (pageWindow.OffscreenCanvas?.prototype) {
      const ocProto = pageWindow.OffscreenCanvas.prototype;
      let nativeOcGetImageData = null;
      const Oc2d = pageWindow.OffscreenCanvasRenderingContext2D;
      if (Oc2d?.prototype && Object.getOwnPropertyDescriptor(Oc2d.prototype, "getImageData")) {
        nativeOcGetImageData = replaceMethod(
          pageWindow,
          Oc2d.prototype,
          "getImageData",
          function (...args) {
            const id = Reflect.apply(nativeOcGetImageData, this, args);
            try {
              noiseImageDataRead(id, canvasSeed, args, this.canvas);
            } catch (error) {
              onRuntimeError("offscreencanvas.getImageData", error);
            }
            return id;
          },
          replacements
        );
      }
      if (nativeOcGetImageData && Object.getOwnPropertyDescriptor(ocProto, "convertToBlob")) {
        let nativeConvertToBlob = null;
        nativeConvertToBlob = replaceMethod(
          pageWindow,
          ocProto,
          "convertToBlob",
          function (...args) {
            try {
              const w = this.width;
              const h = this.height;
              if (w > 0 && h > 0 && !isWebGpuCanvas(this)) {
                const tmp = new pageWindow.OffscreenCanvas(w, h);
                const tmpCtx = tmp.getContext("2d");
                tmpCtx.drawImage(this, 0, 0);
                const id = Reflect.apply(nativeOcGetImageData, tmpCtx, [0, 0, w, h]);
                applyCanvasNoise(Cu.waiveXrays(id).data, canvasSeed, w, h);
                tmpCtx.putImageData(id, 0, 0);
                return Reflect.apply(nativeConvertToBlob, tmp, args);
              }
            } catch (error) {
              onRuntimeError("offscreencanvas.convertToBlob", error);
            }
            return Reflect.apply(nativeConvertToBlob, this, args);
          },
          replacements
        );
      }
    }

    // 0057r3: record canvases that get a WebGPU context (only when WebGPU is
    // exposed) so their exports stay native (see webgpuCanvases).
    if (pageWindow.navigator?.gpu) {
      const trackWebGpu = (proto, label) => {
        if (!proto || !Object.getOwnPropertyDescriptor(proto, "getContext")) {
          return;
        }
        let nativeGetContext = null;
        nativeGetContext = replaceMethod(
          pageWindow,
          proto,
          "getContext",
          function (...args) {
            const ctx = Reflect.apply(nativeGetContext, this, args);
            try {
              if (ctx && String(args[0]) === "webgpu") {
                webgpuCanvases.add(unwaived(this));
              }
            } catch (error) {
              onRuntimeError(label, error);
            }
            return ctx;
          },
          replacements
        );
      };
      trackWebGpu(canvasProto, "canvas.getContext");
      trackWebGpu(pageWindow.OffscreenCanvas?.prototype, "offscreencanvas.getContext");
    }

    // Soft residual (0036)+0039: fonts coherence / fingerprint farbling.
    // Brave-inspired, Firefox/LibreWolf/Gecko persona only — no Chrome font lists.
    // Surfaces: measureText width (Canvas2D + OffscreenCanvas2D), document.fonts.check,
    // FontFaceSet values/keys/entries/forEach/@@iterator/size/load (0039),
    // DOM offsetWidth/clientWidth/getBoundingClientRect width. Silence-safe fudge
    // [0.999,1.0); width 0 stays 0. Double-read stable (constant per fontSeed).
    // document.fonts.ready is NOT wrapped (host load Promise; not a font list).
    // Default-on with depth hooks (same gate as audio/WebGL).
    if (pageWindow.CanvasRenderingContext2D?.prototype?.measureText ||
        pageWindow.document?.fonts?.check ||
        pageWindow.HTMLElement?.prototype) {
      const installFontsInPage = new pageWindow.Function(
        "seed",
        `"use strict";
var fontFudge = 0.999 + (((seed >>> 0) / 4294967295) / 1000);
function farbleWidth(w) {
  if (typeof w !== "number" || !isFinite(w) || w === 0) { return w; }
  return w * fontFudge;
}
function farbleIntWidth(w) {
  if (typeof w !== "number" || !isFinite(w) || w === 0) { return w; }
  var out = Math.round(w * fontFudge);
  return out < 0 ? 0 : out;
}
// Firefox-plausible generics + common desktop families (NOT Chrome-only lists).
var FIREFOX_BASELINE = {
  "serif":1,"sans-serif":1,"monospace":1,"cursive":1,"fantasy":1,"system-ui":1,
  "ui-sans-serif":1,"ui-serif":1,"ui-monospace":1,"ui-rounded":1,"emoji":1,
  "math":1,"fangsong":1,
  "arial":1,"helvetica":1,"helvetica neue":1,"times":1,"times new roman":1,
  "courier":1,"courier new":1,"georgia":1,"verdana":1,"tahoma":1,
  "trebuchet ms":1,"palatino":1,"palatino linotype":1,"garamond":1,
  "lucida grande":1,"lucida console":1,"lucida sans":1,"lucida sans unicode":1,
  "menlo":1,"monaco":1,"consolas":1,"andale mono":1,"monaco":1,
  "apple color emoji":1,"segoe ui":1,"segoe ui emoji":1,"segoe ui symbol":1,
  "arial unicode ms":1,"microsoft sans serif":1,"symbol":1,"wingdings":1,
  "comic sans ms":1,"impact":1,"bookman old style":1,"andale mono":1,
  "sans-serif-smallcaps":1
};
function hashFont(name) {
  var h = seed >>> 0;
  var s = String(name || "");
  for (var i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function normalizeFamily(fam) {
  return String(fam || "").replace(/^['\"]+|['\"]+$/g, "").trim().toLowerCase();
}
function extractFamilies(font) {
  // CSS font shorthand: size/weight then family list. Take trailing families.
  var s = String(font || "");
  var idx = s.lastIndexOf(" ");
  // Prefer split on comma families after first length/size token cluster.
  var famPart = s;
  var m = s.match(/\d+(?:px|pt|em|rem|%)\s+(.+)$/i);
  if (m) { famPart = m[1]; }
  return famPart.split(",").map(normalizeFamily).filter(Boolean);
}
function shouldHideFamily(family) {
  var key = normalizeFamily(family);
  if (!key || FIREFOX_BASELINE[key]) { return false; }
  // Deterministic keep/drop of non-baseline (Brave-like subset, sticky per seed).
  return (hashFont(key) & 1) === 0;
}
function copyMetrics(m, fw) {
  var out = { width: fw };
  var props = [
    "actualBoundingBoxLeft","actualBoundingBoxRight",
    "actualBoundingBoxAscent","actualBoundingBoxDescent",
    "fontBoundingBoxAscent","fontBoundingBoxDescent",
    "emHeightAscent","emHeightDescent",
    "hangingBaseline","alphabeticBaseline","ideographicBaseline"
  ];
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    try {
      var v = m[p];
      if (typeof v === "number") {
        if (p === "actualBoundingBoxLeft" || p === "actualBoundingBoxRight") {
          out[p] = farbleWidth(v);
        } else {
          out[p] = v;
        }
      }
    } catch (_e) {}
  }
  return out;
}

var hooks = { measureText: null, origMeasureText: null, measureTextProto: null,
  ocMeasureText: null, origOcMeasureText: null, ocMeasureTextProto: null,
  check: null, origCheck: null, checkProto: null,
  ow: null, origOw: null, owProto: null,
  cw: null, origCw: null, cwProto: null,
  gbcr: null, origGbcr: null, gbcrProto: null,
  fudge: fontFudge, seed: seed >>> 0 };

// --- CanvasRenderingContext2D.measureText ---
if (typeof CanvasRenderingContext2D !== "undefined" &&
    CanvasRenderingContext2D.prototype &&
    typeof CanvasRenderingContext2D.prototype.measureText === "function") {
  var c2d = CanvasRenderingContext2D.prototype;
  var origMT = c2d.measureText;
  var wrappedMT = function(text) {
    var m = origMT.apply(this, arguments);
    if (!m) { return m; }
    var w = m.width;
    var fw = farbleWidth(w);
    if (fw === w) { return m; }
    return copyMetrics(m, fw);
  };
  Object.defineProperty(c2d, "measureText", {
    configurable: true, enumerable: true, writable: true, value: wrappedMT
  });
  hooks.measureText = wrappedMT;
  hooks.origMeasureText = origMT;
  hooks.measureTextProto = c2d;
}

// --- OffscreenCanvasRenderingContext2D.measureText (when present) ---
if (typeof OffscreenCanvasRenderingContext2D !== "undefined" &&
    OffscreenCanvasRenderingContext2D.prototype &&
    typeof OffscreenCanvasRenderingContext2D.prototype.measureText === "function") {
  var oc2d = OffscreenCanvasRenderingContext2D.prototype;
  var origOcMT = oc2d.measureText;
  var wrappedOcMT = function(text) {
    var m = origOcMT.apply(this, arguments);
    if (!m) { return m; }
    var w = m.width;
    var fw = farbleWidth(w);
    if (fw === w) { return m; }
    return copyMetrics(m, fw);
  };
  Object.defineProperty(oc2d, "measureText", {
    configurable: true, enumerable: true, writable: true, value: wrappedOcMT
  });
  hooks.ocMeasureText = wrappedOcMT;
  hooks.origOcMeasureText = origOcMT;
  hooks.ocMeasureTextProto = oc2d;
}

// --- document.fonts.check (FontFaceSet.prototype.check) ---
var ffsProto = null;
if (typeof FontFaceSet !== "undefined" && FontFaceSet.prototype) {
  ffsProto = FontFaceSet.prototype;
} else if (document && document.fonts) {
  ffsProto = Object.getPrototypeOf(document.fonts);
}
if (ffsProto && typeof ffsProto.check === "function") {
  var origCheck = ffsProto.check;
  var wrappedCheck = function(font, text) {
    var native = origCheck.apply(this, arguments);
    if (!native) { return false; }
    var families = extractFamilies(font);
    for (var i = 0; i < families.length; i++) {
      if (shouldHideFamily(families[i])) { return false; }
    }
    return true;
  };
  Object.defineProperty(ffsProto, "check", {
    configurable: true, enumerable: true, writable: true, value: wrappedCheck
  });
  hooks.check = wrappedCheck;
  hooks.origCheck = origCheck;
  hooks.checkProto = ffsProto;
}

// --- Soft residual (0039): FontFaceSet enumeration coherence ---
// Same shouldHideFamily as check. Filter values/keys/entries/forEach/@@iterator/
// size/load. ready stays host Promise (async populate notification only).
function faceFamily(face) {
  try {
    if (!face) { return ""; }
    return normalizeFamily(face.family || "");
  } catch (_e) { return ""; }
}
function keepFace(face) {
  var fam = faceFamily(face);
  if (!fam) { return true; } // keep anonymous / empty rather than invent
  return !shouldHideFamily(fam);
}
function makeFaceIterator(faces, asEntry) {
  var i = 0;
  return {
    next: function() {
      if (i >= faces.length) {
        return { value: undefined, done: true };
      }
      var face = faces[i++];
      if (asEntry) {
        return { value: [face, face], done: false };
      }
      return { value: face, done: false };
    },
    [Symbol.iterator]: function() { return this; }
  };
}
if (ffsProto) {
  var origValues = typeof ffsProto.values === "function" ? ffsProto.values : null;
  var origEntries = typeof ffsProto.entries === "function" ? ffsProto.entries : null;
  var origForEach = typeof ffsProto.forEach === "function" ? ffsProto.forEach : null;
  var origLoad = typeof ffsProto.load === "function" ? ffsProto.load : null;
  var sizeDesc = Object.getOwnPropertyDescriptor(ffsProto, "size");
  var origSizeGet = sizeDesc && typeof sizeDesc.get === "function" ? sizeDesc.get : null;

  // Capture natives before wrapping so collectKeptFaces can use forEach safely.
  var nativeForEach = origForEach;
  var nativeValues = origValues;

  function keptFromThis() {
    var kept = [];
    try {
      if (nativeForEach) {
        nativeForEach.call(this, function(face) {
          if (keepFace(face)) { kept.push(face); }
        });
        return kept;
      }
    } catch (_e) {}
    try {
      if (nativeValues) {
        var it = nativeValues.call(this);
        if (it && typeof it.next === "function") {
          for (;;) {
            var n = it.next();
            if (!n || n.done) { break; }
            if (keepFace(n.value)) { kept.push(n.value); }
          }
        }
      }
    } catch (_e2) {}
    return kept;
  }

  if (origValues) {
    var wrappedValues = function() {
      return makeFaceIterator(keptFromThis.call(this), false);
    };
    Object.defineProperty(ffsProto, "values", {
      configurable: true, enumerable: true, writable: true, value: wrappedValues
    });
    // keys and @@iterator are IDL aliases of values on Gecko FontFaceSet
    try {
      Object.defineProperty(ffsProto, "keys", {
        configurable: true, enumerable: true, writable: true, value: wrappedValues
      });
    } catch (_e) {}
    try {
      Object.defineProperty(ffsProto, Symbol.iterator, {
        configurable: true, enumerable: false, writable: true, value: wrappedValues
      });
    } catch (_e2) {}
    hooks.values = wrappedValues;
    hooks.origValues = origValues;
    hooks.valuesProto = ffsProto;
  }

  if (origEntries) {
    var wrappedEntries = function() {
      return makeFaceIterator(keptFromThis.call(this), true);
    };
    Object.defineProperty(ffsProto, "entries", {
      configurable: true, enumerable: true, writable: true, value: wrappedEntries
    });
    hooks.entries = wrappedEntries;
    hooks.origEntries = origEntries;
    hooks.entriesProto = ffsProto;
  }

  if (origForEach) {
    var wrappedForEach = function(cb, thisArg) {
      if (typeof cb !== "function") {
        return origForEach.apply(this, arguments);
      }
      var kept = keptFromThis.call(this);
      for (var i = 0; i < kept.length; i++) {
        cb.call(thisArg, kept[i], kept[i], this);
      }
    };
    Object.defineProperty(ffsProto, "forEach", {
      configurable: true, enumerable: true, writable: true, value: wrappedForEach
    });
    hooks.forEach = wrappedForEach;
    hooks.origForEach = origForEach;
    hooks.forEachProto = ffsProto;
  }

  if (origSizeGet) {
    var wrappedSize = function() {
      return keptFromThis.call(this).length;
    };
    Object.defineProperty(ffsProto, "size", {
      configurable: true, enumerable: true, get: wrappedSize
    });
    hooks.size = wrappedSize;
    hooks.origSize = origSizeGet;
    hooks.sizeProto = ffsProto;
  }

  if (origLoad) {
    var wrappedLoad = function(font, text) {
      var p = origLoad.apply(this, arguments);
      if (!p || typeof p.then !== "function") { return p; }
      return p.then(function(faces) {
        if (!faces || typeof faces.length !== "number") { return faces; }
        var out = [];
        for (var i = 0; i < faces.length; i++) {
          if (keepFace(faces[i])) { out.push(faces[i]); }
        }
        return out;
      });
    };
    Object.defineProperty(ffsProto, "load", {
      configurable: true, enumerable: true, writable: true, value: wrappedLoad
    });
    hooks.load = wrappedLoad;
    hooks.origLoad = origLoad;
    hooks.loadProto = ffsProto;
  }
}

// --- DOM metric probes (offsetWidth / clientWidth / getBoundingClientRect) ---
var elProto = typeof HTMLElement !== "undefined" ? HTMLElement.prototype : null;
if (elProto) {
  var owDesc = Object.getOwnPropertyDescriptor(elProto, "offsetWidth");
  if (owDesc && typeof owDesc.get === "function") {
    var origOw = owDesc.get;
    var wrappedOw = function() {
      return farbleIntWidth(origOw.call(this));
    };
    Object.defineProperty(elProto, "offsetWidth", {
      configurable: true, enumerable: true, get: wrappedOw
    });
    hooks.ow = wrappedOw;
    hooks.origOw = origOw;
    hooks.owProto = elProto;
  }
  var cwDesc = Object.getOwnPropertyDescriptor(elProto, "clientWidth");
  if (cwDesc && typeof cwDesc.get === "function") {
    var origCw = cwDesc.get;
    var wrappedCw = function() {
      return farbleIntWidth(origCw.call(this));
    };
    Object.defineProperty(elProto, "clientWidth", {
      configurable: true, enumerable: true, get: wrappedCw
    });
    hooks.cw = wrappedCw;
    hooks.origCw = origCw;
    hooks.cwProto = elProto;
  }
}
var geomProto = typeof Element !== "undefined" ? Element.prototype : elProto;
if (geomProto && typeof geomProto.getBoundingClientRect === "function") {
  var origGbcr = geomProto.getBoundingClientRect;
  var wrappedGbcr = function() {
    var r = origGbcr.apply(this, arguments);
    if (!r) { return r; }
    var w = farbleWidth(r.width);
    if (w === r.width) { return r; }
    try {
      if (typeof DOMRect === "function") {
        return new DOMRect(r.x, r.y, w, r.height);
      }
    } catch (_e) {}
    return {
      x: r.x, y: r.y, width: w, height: r.height,
      top: r.top, left: r.left, bottom: r.bottom,
      right: r.left + w,
      toJSON: function() {
        return { x: this.x, y: this.y, width: this.width, height: this.height,
          top: this.top, left: this.left, bottom: this.bottom, right: this.right };
      }
    };
  };
  Object.defineProperty(geomProto, "getBoundingClientRect", {
    configurable: true, enumerable: true, writable: true, value: wrappedGbcr
  });
  hooks.gbcr = wrappedGbcr;
  hooks.origGbcr = origGbcr;
  hooks.gbcrProto = geomProto;
}

return hooks;`
      );

      let installedFonts;
      try {
        installedFonts = installFontsInPage(fontSeed >>> 0);
      } catch (error) {
        onRuntimeError("fonts.installPage", error);
        throw error;
      }

      function pushPageHook(proto, name, wrapper, original, kind) {
        if (!proto || !wrapper || !original) {
          return;
        }
        if (kind === "getter") {
          replacements.push({
            proto,
            name,
            wrapper,
            originalDescriptor: {
              configurable: true,
              enumerable: true,
              get: original,
            },
          });
        } else {
          replacements.push({
            proto,
            name,
            wrapper,
            originalDescriptor: {
              configurable: true,
              enumerable: true,
              writable: true,
              value: original,
            },
          });
        }
      }

      pushPageHook(
        installedFonts.measureTextProto,
        "measureText",
        installedFonts.measureText,
        installedFonts.origMeasureText,
        "method"
      );
      pushPageHook(
        installedFonts.ocMeasureTextProto,
        "measureText",
        installedFonts.ocMeasureText,
        installedFonts.origOcMeasureText,
        "method"
      );
      pushPageHook(
        installedFonts.checkProto,
        "check",
        installedFonts.check,
        installedFonts.origCheck,
        "method"
      );
      // Soft residual (0039): FontFaceSet enumeration hooks
      pushPageHook(
        installedFonts.valuesProto,
        "values",
        installedFonts.values,
        installedFonts.origValues,
        "method"
      );
      pushPageHook(
        installedFonts.entriesProto,
        "entries",
        installedFonts.entries,
        installedFonts.origEntries,
        "method"
      );
      pushPageHook(
        installedFonts.forEachProto,
        "forEach",
        installedFonts.forEach,
        installedFonts.origForEach,
        "method"
      );
      pushPageHook(
        installedFonts.sizeProto,
        "size",
        installedFonts.size,
        installedFonts.origSize,
        "getter"
      );
      pushPageHook(
        installedFonts.loadProto,
        "load",
        installedFonts.load,
        installedFonts.origLoad,
        "method"
      );
      pushPageHook(
        installedFonts.owProto,
        "offsetWidth",
        installedFonts.ow,
        installedFonts.origOw,
        "getter"
      );
      pushPageHook(
        installedFonts.cwProto,
        "clientWidth",
        installedFonts.cw,
        installedFonts.origCw,
        "getter"
      );
      pushPageHook(
        installedFonts.gbcrProto,
        "getBoundingClientRect",
        installedFonts.gbcr,
        installedFonts.origGbcr,
        "method"
      );
    }

    // Soft residual (0037): speechSynthesis.getVoices coherence / fingerprint farbling.
    // Brave-inspired sticky farbling, Firefox/LibreWolf/Gecko persona only —
    // filter/reorder native host voices; NEVER invent Chrome-only voice names.
    // Empty native list stays empty. Default voice always kept. Double-read /
    // voiceschanged coherent via fingerprint-keyed cache. Default-on with depth.
    // SpeechRecognition: soft residual — only lightly touch lang default when the
    // pref-gated constructor is already exposed; do not synthesize webkit* APIs.
    if (pageWindow.speechSynthesis?.getVoices ||
        pageWindow.SpeechSynthesis?.prototype?.getVoices) {
      const installSpeechInPage = new pageWindow.Function(
        "seed",
        `"use strict";
var SEED = seed >>> 0;
function hashStr(s) {
  var h = SEED;
  var str = String(s || "");
  for (var i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function voiceKey(v) {
  try {
    return String(v.voiceURI || "") + "\\0" + String(v.name || "") + "\\0" + String(v.lang || "");
  } catch (_e) {
    return "";
  }
}
function shouldKeepVoice(v, idx, total) {
  // Always keep default voice(s) and the first voice (TTS compatibility).
  try {
    if (v && v.default) { return true; }
  } catch (_e) {}
  if (idx === 0) { return true; }
  // Keep a deterministic majority (~3/4) of remaining native voices.
  // Never invent voices — only subset of what the host already exposes.
  return (hashStr(voiceKey(v)) & 3) !== 0;
}
function sortKey(v) {
  return hashStr("ord:" + voiceKey(v));
}
var cacheBySig = Object.create(null);
function listSignature(voices) {
  var parts = [];
  for (var i = 0; i < voices.length; i++) {
    parts.push(voiceKey(voices[i]));
  }
  return parts.join("|");
}
function farbledFromNative(nativeList) {
  var arr = [];
  for (var i = 0; i < nativeList.length; i++) {
    arr.push(nativeList[i]);
  }
  if (!arr.length) { return arr; }
  var kept = [];
  for (var j = 0; j < arr.length; j++) {
    if (shouldKeepVoice(arr[j], j, arr.length)) {
      kept.push(arr[j]);
    }
  }
  // Guarantee non-empty when native was non-empty.
  if (!kept.length) { kept.push(arr[0]); }
  kept.sort(function(a, b) {
    var ka = sortKey(a);
    var kb = sortKey(b);
    if (ka < kb) { return -1; }
    if (ka > kb) { return 1; }
    return 0;
  });
  // Stable secondary: defaults first after seed order for believable UX.
  kept.sort(function(a, b) {
    var da = 0, db = 0;
    try { da = a.default ? 0 : 1; } catch (_e) {}
    try { db = b.default ? 0 : 1; } catch (_e) {}
    if (da !== db) { return da - db; }
    var ka = sortKey(a);
    var kb = sortKey(b);
    if (ka < kb) { return -1; }
    if (ka > kb) { return 1; }
    return 0;
  });
  return kept;
}

var hooks = {
  getVoices: null, origGetVoices: null, synthProto: null,
  speechCtor: null, origLangDesc: null, langProto: null,
  seed: SEED
};

var synth = null;
if (typeof speechSynthesis !== "undefined" && speechSynthesis) {
  synth = speechSynthesis;
} else if (typeof SpeechSynthesis !== "undefined" && SpeechSynthesis.prototype) {
  // Rare: operate on prototype if instance missing early.
  synth = null;
}
var synthProto = null;
if (synth) {
  synthProto = Object.getPrototypeOf(synth);
} else if (typeof SpeechSynthesis !== "undefined" && SpeechSynthesis.prototype) {
  synthProto = SpeechSynthesis.prototype;
}
if (synthProto && typeof synthProto.getVoices === "function") {
  var origGV = synthProto.getVoices;
  var wrappedGV = function() {
    var nativeList = origGV.apply(this, arguments);
    if (!nativeList || !nativeList.length) {
      return nativeList;
    }
    var sig = listSignature(nativeList);
    if (cacheBySig[sig]) {
      return cacheBySig[sig];
    }
    var farbled = farbledFromNative(nativeList);
    cacheBySig[sig] = farbled;
    return farbled;
  };
  Object.defineProperty(synthProto, "getVoices", {
    configurable: true, enumerable: true, writable: true, value: wrappedGV
  });
  hooks.getVoices = wrappedGV;
  hooks.origGetVoices = origGV;
  hooks.synthProto = synthProto;
}

// Soft residual: SpeechRecognition / webkitSpeechRecognition lang default only
// when already exposed (pref media.webspeech.recognition.enable). Do not create
// the constructors — that would be Chrome cosplay / API invention.
var SR = null;
try {
  if (typeof SpeechRecognition === "function") { SR = SpeechRecognition; }
  else if (typeof webkitSpeechRecognition === "function") { SR = webkitSpeechRecognition; }
} catch (_e) {}
if (SR && SR.prototype) {
  var langDesc = Object.getOwnPropertyDescriptor(SR.prototype, "lang");
  if (langDesc && typeof langDesc.set === "function" && typeof langDesc.get === "function") {
    var origGet = langDesc.get;
    var origSet = langDesc.set;
    // Seed-tied default lang when page leaves lang empty — Firefox-plausible BCP47.
    var LANG_POOL = ["en-US", "en-GB", "en-CA", "en-AU", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "ja-JP"];
    var defaultLang = LANG_POOL[SEED % LANG_POOL.length];
    var wrappedGet = function() {
      var v = origGet.call(this);
      if (v === "" || v == null) { return defaultLang; }
      return v;
    };
    var wrappedSet = function(v) {
      if (v === "" || v == null) {
        return origSet.call(this, defaultLang);
      }
      return origSet.call(this, v);
    };
    Object.defineProperty(SR.prototype, "lang", {
      configurable: true, enumerable: true, get: wrappedGet, set: wrappedSet
    });
    hooks.speechCtor = SR;
    hooks.origLangDesc = langDesc;
    hooks.langProto = SR.prototype;
    hooks.langGet = wrappedGet;
    hooks.langSet = wrappedSet;
  }
}

return hooks;`
      );

      let installedSpeech;
      try {
        installedSpeech = installSpeechInPage(speechSeed >>> 0);
      } catch (error) {
        onRuntimeError("speech.installPage", error);
        throw error;
      }

      function pushSpeechHook(proto, name, wrapper, original, kind) {
        if (!proto || !wrapper || !original) {
          return;
        }
        if (kind === "getter") {
          replacements.push({
            proto,
            name,
            wrapper,
            originalDescriptor: {
              configurable: true,
              enumerable: true,
              get: original,
            },
          });
        } else if (kind === "accessor") {
          replacements.push({
            proto,
            name,
            wrapper,
            originalDescriptor: original,
          });
        } else {
          replacements.push({
            proto,
            name,
            wrapper,
            originalDescriptor: {
              configurable: true,
              enumerable: true,
              writable: true,
              value: original,
            },
          });
        }
      }

      pushSpeechHook(
        installedSpeech.synthProto,
        "getVoices",
        installedSpeech.getVoices,
        installedSpeech.origGetVoices,
        "method"
      );
      // lang accessor: restore via originalDescriptor blob if present
      if (installedSpeech.langProto && installedSpeech.origLangDesc) {
        replacements.push({
          proto: installedSpeech.langProto,
          name: "lang",
          wrapper: installedSpeech.langGet,
          originalDescriptor: installedSpeech.origLangDesc,
        });
      }
    }

    // WebGPU (0038, 0057r3): real features / limits / device, persona
    // AdapterInfo, Intel persona hides Apple-silicon-only formats (WEBGPU_BODY).
    // LibreWolf defaults dom.webgpu.enabled=false: idle when navigator.gpu is absent.
    if (pageWindow.navigator?.gpu?.requestAdapter) {
      const installWebGpuInPage = new pageWindow.Function(
        "seed",
        "gpuVendor",
        "gpuRenderer",
        WEBGPU_BODY
      );

      let installedWebGpu;
      try {
        installedWebGpu = installWebGpuInPage(
          webgpuSeed >>> 0,
          String(gpu.vendor || "Apple"),
          String(gpu.renderer || "Apple M1")
        );
      } catch (error) {
        onRuntimeError("webgpu.installPage", error);
        throw error;
      }

      if (
        installedWebGpu &&
        installedWebGpu.gpuProto &&
        installedWebGpu.requestAdapter &&
        installedWebGpu.origRequestAdapter
      ) {
        replacements.push({
          proto: installedWebGpu.gpuProto,
          name: "requestAdapter",
          wrapper: installedWebGpu.requestAdapter,
          originalDescriptor: {
            configurable: true,
            enumerable: true,
            writable: true,
            value: installedWebGpu.origRequestAdapter,
          },
        });
      }
    }

    // AudioContext and OfflineAudioContext both expose AudioBuffer.
    // Soft residual (pin 2 / PR #47 XOR FAIL f18c0b6): chrome-exported
    // getChannelData + waived Float32Array.set stayed inert on OfflineAudio
    // (deltaSum=0; startRendering sums identical to Homogeneous) while canvas
    // PASS and depth.lastInstall=installed. Xray cross-compartment channel
    // views swallow chrome writes. Fix: install AudioBuffer.getChannelData and
    // OfflineAudioContext.startRendering entirely in the page compartment
    // (Phase 1 content parity) via pageWindow.Function.
    // Soft residual (0031): Brave-style silence-safe farbling — multiplicative
    // fudge (0.999 + seed/2^32/1000) so exact/near-zero channels stay silent
    // (no additive tell). Also wrap copyFromChannel + AnalyserNode get*Data
    // (time/frequency, float/byte). Seed remains depth audioSeed (persona /
    // eTLD-effective via 0030 snapshotForBrowsingContext). Double-read stable
    // via WeakMap contentKey (mutate-once per buffer channel).
    if (pageWindow.AudioBuffer?.prototype?.getChannelData) {
      const audioProto = pageWindow.AudioBuffer.prototype;
      const gcdDesc = Object.getOwnPropertyDescriptor(audioProto, "getChannelData");
      if (!gcdDesc || typeof gcdDesc.value !== "function") {
        throw new Error("AudioBuffer.getChannelData native unavailable");
      }

      const installAudioInPage = new pageWindow.Function(
        "seed",
        `"use strict";
var origGCD = AudioBuffer.prototype.getChannelData;
var origCFC = typeof AudioBuffer.prototype.copyFromChannel === "function"
  ? AudioBuffer.prototype.copyFromChannel : null;
var noisedBuffers = new WeakMap();
// Brave BALANCED-style fudge: [0.999, 1.0). Zero * fudge === 0 (silence-safe).
var fudge = 0.999 + (((seed >>> 0) / 4294967295) / 1000);
// 0057: the analyser's float frequency data is in dB. A signal scaled by fudge
// reads 20*log10(fudge) dB lower in every bin (silence -Infinity stays), so
// frequency data stays consistent with the farbled time-domain data and with
// OfflineAudioContext buffers (multiplying dB values was not).
var fudgeDb = 20 * Math.log10(fudge);
function farbleFloatDb(data) {
  for (var i = 0; i < data.length; i++) {
    data[i] = data[i] + fudgeDb;
  }
}
function contentKey(data) {
  var n = data.length | 0;
  if (!n) { return "0"; }
  return n + ":" + data[0] + ":" + data[n >> 1] + ":" + data[n - 1];
}
function farbleFloat(data) {
  for (var i = 0; i < data.length; i++) {
    data[i] = data[i] * fudge;
  }
}
function farbleByteTimeDomain(data) {
  // Unsigned PCM: silence center is 128. Keep 128 fixed under fudge.
  for (var i = 0; i < data.length; i++) {
    var v = data[i] | 0;
    var out = Math.round((v - 128) * fudge + 128);
    data[i] = out < 0 ? 0 : (out > 255 ? 255 : out);
  }
}
function farbleByteFrequency(data) {
  // Frequency byte: silence is 0 → stays 0 under multiply.
  for (var i = 0; i < data.length; i++) {
    var out = Math.round((data[i] | 0) * fudge);
    data[i] = out < 0 ? 0 : (out > 255 ? 255 : out);
  }
}
function markFarbled(buf, channel, data) {
  var map = noisedBuffers.get(buf);
  if (!map) { map = new Map(); noisedBuffers.set(buf, map); }
  map.set(channel, contentKey(data));
}
function isFarbled(buf, channel, data) {
  var map = noisedBuffers.get(buf);
  return !!(map && map.get(channel) === contentKey(data));
}
function farbleBuffer(buf) {
  var n = buf.numberOfChannels | 0;
  for (var ch = 0; ch < n; ch++) {
    var data = origGCD.call(buf, ch);
    if (isFarbled(buf, ch, data)) { continue; }
    farbleFloat(data);
    markFarbled(buf, ch, data);
  }
}
function wrappedGCD(channel) {
  var data = origGCD.call(this, channel);
  if (isFarbled(this, channel, data)) { return data; }
  farbleFloat(data);
  markFarbled(this, channel, data);
  return data;
}
Object.defineProperty(AudioBuffer.prototype, "getChannelData", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: wrappedGCD
});
var wrappedCFC = null;
if (origCFC) {
  wrappedCFC = function(destination, channelNumber, startInChannel) {
    var ch = channelNumber | 0;
    var ret = origCFC.apply(this, arguments);
    if (!destination || !destination.length) { return ret; }
    // If underlying channel already farbled, destination is a farbled copy.
    var map = noisedBuffers.get(this);
    if (map && map.has(ch)) { return ret; }
    farbleFloat(destination);
    // Keep underlying coherent with getChannelData (mutate-once).
    try {
      var data = origGCD.call(this, ch);
      if (!isFarbled(this, ch, data)) {
        farbleFloat(data);
        markFarbled(this, ch, data);
      }
    } catch (_e) {}
    return ret;
  };
  Object.defineProperty(AudioBuffer.prototype, "copyFromChannel", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: wrappedCFC
  });
}
var wrappedSR = null;
var origSR = null;
var srProto = null;
if (typeof OfflineAudioContext !== "undefined" && OfflineAudioContext.prototype) {
  srProto = OfflineAudioContext.prototype;
  origSR = srProto.startRendering;
  if (typeof origSR === "function") {
    wrappedSR = function() {
      var result = origSR.apply(this, arguments);
      if (result && typeof result.then === "function") {
        return result.then(function (buffer) {
          farbleBuffer(buffer);
          return buffer;
        });
      }
      if (result) { farbleBuffer(result); }
      return result;
    };
    Object.defineProperty(srProto, "startRendering", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: wrappedSR
    });
  }
}
var analyserHooks = [];
if (typeof AnalyserNode !== "undefined" && AnalyserNode.prototype) {
  var aProto = AnalyserNode.prototype;
  function wrapAnalyser(name, kind) {
    var desc = Object.getOwnPropertyDescriptor(aProto, name);
    if (!desc || typeof desc.value !== "function") { return; }
    var orig = desc.value;
    var wrapped = function(array) {
      var ret = orig.apply(this, arguments);
      if (array && array.length) {
        if (kind === "float") {
          farbleFloat(array);
        } else if (kind === "floatDb") {
          farbleFloatDb(array);
        } else if (kind === "byteTime") {
          farbleByteTimeDomain(array);
        } else {
          farbleByteFrequency(array);
        }
      }
      return ret;
    };
    Object.defineProperty(aProto, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: wrapped
    });
    analyserHooks.push({ name: name, wrapper: wrapped, original: orig });
  }
  wrapAnalyser("getFloatTimeDomainData", "float");
  wrapAnalyser("getFloatFrequencyData", "floatDb");
  wrapAnalyser("getByteTimeDomainData", "byteTime");
  wrapAnalyser("getByteFrequencyData", "byteFreq");
}
return {
  gcd: wrappedGCD,
  origGCD: origGCD,
  cfc: wrappedCFC,
  origCFC: origCFC,
  sr: wrappedSR,
  origSR: origSR,
  srProto: srProto,
  fudge: fudge,
  analyserHooks: analyserHooks
};`
      );

      let installedAudio;
      try {
        installedAudio = installAudioInPage(audioSeed >>> 0);
      } catch (error) {
        onRuntimeError("audio.installPage", error);
        throw error;
      }

      replacements.push({
        proto: audioProto,
        name: "getChannelData",
        wrapper: installedAudio.gcd,
        originalDescriptor: gcdDesc,
      });

      if (
        installedAudio.cfc &&
        installedAudio.origCFC &&
        typeof audioProto.copyFromChannel === "function"
      ) {
        const cfcDesc = Object.getOwnPropertyDescriptor(
          audioProto,
          "copyFromChannel"
        );
        // After page install, descriptor.value is already the wrapper; capture
        // orig from return value for uninstall.
        replacements.push({
          proto: audioProto,
          name: "copyFromChannel",
          wrapper: installedAudio.cfc,
          originalDescriptor: {
            configurable: true,
            enumerable: true,
            writable: true,
            value: installedAudio.origCFC,
          },
        });
        void cfcDesc;
      }

      if (
        installedAudio.sr &&
        installedAudio.origSR &&
        pageWindow.OfflineAudioContext?.prototype
      ) {
        replacements.push({
          proto: pageWindow.OfflineAudioContext.prototype,
          name: "startRendering",
          wrapper: installedAudio.sr,
          originalDescriptor: {
            configurable: true,
            enumerable: true,
            writable: true,
            value: installedAudio.origSR,
          },
        });
      }

      if (
        installedAudio.analyserHooks &&
        installedAudio.analyserHooks.length &&
        pageWindow.AnalyserNode?.prototype
      ) {
        const aProto = pageWindow.AnalyserNode.prototype;
        for (const hook of installedAudio.analyserHooks) {
          replacements.push({
            proto: aProto,
            name: hook.name,
            wrapper: hook.wrapper,
            originalDescriptor: {
              configurable: true,
              enumerable: true,
              writable: true,
              value: hook.original,
            },
          });
        }
      }
    }


    installedByWindow.set(key, { replacements });
    return "installed";
  } catch (error) {
    for (const replacement of replacements.slice().reverse()) {
      try {
        restoreReplacement(replacement);
      } catch (_e) {}
    }
    throw error;
  }
}

export class DarkstrDepthHooksChild extends JSWindowActorChild {
  _report(ok, eventType, status, error = "") {
    const detail = {
      ok: !!ok,
      event: String(eventType || "unknown"),
      status: String(status || "unknown"),
      error: error ? errorText(error).slice(0, 1000) : "",
    };
    try {
      this.sendAsyncMessage("DarkstrDepthHooks:InstallStatus", detail);
    } catch (reportError) {
      console.error("darkstr depth diagnostic IPC failed", reportError, detail);
    }
  }

  /**
   * 0057: seeds synchronously at DOMWindowCreated (before any page script),
   * only while the parent says depth is armed (sharedData hint). Returns
   * undefined when the parent cannot answer yet (async fallback).
   */
  _seedsSync() {
    try {
      if (Services.cpmm.sharedData.get("darkstr:depthArmed") !== true) {
        return undefined;
      }
      const results = Services.cpmm.sendSyncMessage(
        "DarkstrDepthHooks:GetSeedsSync",
        { innerWindowId: this.manager.innerWindowId }
      );
      const r = results?.[0];
      if (!r || r.retry) {
        return undefined;
      }
      return r.seeds || null;
    } catch (_e) {
      return undefined;
    }
  }

  async pullAndInstall(eventType) {
    const early =
      eventType === "DOMWindowCreated" || eventType === "DOMDocElementInserted";
    if (eventType === "DOMDocElementInserted") {
      // 0057: covers documents that reuse their initial about:blank inner
      // window (same-origin iframes), which get no DOMWindowCreated of their
      // own; for every other document this is a no-op (already installed).
      try {
        const w = this.contentWindow;
        if (!w || depthHooksInstalled(w)) {
          return;
        }
      } catch (_e) {}
    }
    let seeds = early ? this._seedsSync() : undefined;
    if (seeds === undefined && eventType === "DOMDocElementInserted") {
      // Not armed (off mode) or parent not ready: DOMWindowCreated / pageshow
      // keep the async path; no extra IPC per document.
      return;
    }
    if (seeds === undefined) {
      try {
        seeds = await this.sendQuery("DarkstrDepthHooks:GetSeeds");
      } catch (error) {
        console.error("darkstr depth seed IPC failed", error);
        this._report(false, eventType, "seed-query-failed", error);
        return;
      }
    }

    const rawWindow = this.contentWindow;
    if (!rawWindow) {
      this._report(false, eventType, "no-content-window", "contentWindow unavailable");
      return;
    }

    if (!seeds || typeof seeds.canvasSeed !== "number") {
      try {
        const status = uninstallDepthHooks(rawWindow);
        this._report(true, eventType, status);
      } catch (error) {
        console.error("darkstr depth uninstall failed", error);
        this._report(false, eventType, "uninstall-failed", error);
      }
      return;
    }

    try {
      const status = installDepthHooks(rawWindow, seeds, (surface, error) => {
        console.error(`darkstr depth runtime failure (${surface})`, error);
        this._report(false, eventType, `runtime-${surface}`, error);
      });
      this._report(true, eventType, status);
    } catch (error) {
      console.error("darkstr depth install failed", error);
      this._report(false, eventType, "install-failed", error);
    }
  }

  async handleEvent(event) {
    if (
      event.type !== "DOMWindowCreated" &&
      event.type !== "DOMDocElementInserted" &&
      event.type !== "pageshow"
    ) {
      return;
    }
    await this.pullAndInstall(event.type);
  }
}
