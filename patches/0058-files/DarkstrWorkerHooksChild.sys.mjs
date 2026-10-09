/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr 0049 — DarkstrWorkerPersona JSProcessActor child (content process).
 *
 * C++ WorkerPrivate::Constructor notifies "darkstr-worker-persona-resolve"
 * with an nsIWritablePropertyBag2 once per top-level worker (only when the
 * hook gate prefs are on). This child asks the parent (sync ppmm message)
 * for the creating document's / owning site's 0051 decision and writes the
 * answer back into the bag; WorkerNavigator then reports it natively.
 *
 * Nothing here wraps Worker / SharedWorker, creates blob: URLs or overrides
 * navigator in JS (0049 retired the Phase 3 blob importScripts wrapper:
 * B4 module SharedWorker, B5 SharedWorker sharing, self.location, relative
 * importScripts and constructor shape are all stock now). deviceMemory is
 * never added — Firefox has none.
 *
 * The only script that still runs in the worker is the 0043 depth prelude
 * (OffscreenCanvas / WebGL / WebGPU coherence), evaluated by C++ in the
 * worker global before the main script. Brand: darkstr — not official
 * LibreWolf.
 */

const TOPIC = "darkstr-worker-persona-resolve";
const MSG_RESOLVE = "DarkstrWorkerHooks:Resolve";

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

export function buildDepthOverrides(depth) {
  if (!depth || typeof depth.canvasSeed !== "number") {
    return "";
  }
  const seed = depth.canvasSeed >>> 0;
  const vendor = depth.gpu?.vendor || "Apple";
  const renderer = depth.gpu?.renderer || "Apple M1";
  // 0057r4: RENDERER / UNMASKED_RENDERER_WEBGL as Gecko reports them.
  const rendererMasked = geckoSanitizeRenderer(renderer);
  const rendererUnmasked = sanitizeUnmaskedPref() ? rendererMasked : renderer;
  return `
;(function(){
  var __s=${seed};
  function __pn(s,i,v){var h=s^(i*2654435761);h=(h^(v*2246822519))>>>0;h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);h=(h^(h>>>16))>>>0;var m=(h>>>1)&3;return(h&1)?m:-m;}
  // 0057: same noise as DepthHooksChild applyCanvasNoiseRect — keyed by the
  // absolute surface pixel (sub-rect reads agree with full reads; GL rows
  // flipped), opaque in-bounds pixels only, so a worker OffscreenCanvas reads
  // exactly what the page reads for the same pixels.
  function __ar(px,s,sx,sy,sw,sh,cw,ch,fy){sx=Math.trunc(+sx||0);sy=Math.trunc(+sy||0);sw=Math.trunc(+sw||0);sh=Math.trunc(+sh||0);cw=Math.trunc(+cw||0);ch=Math.trunc(+ch||0);if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}if(!sw||!sh||!cw||!ch||px.length<sw*sh*4)return;for(var r=0;r<sh;r++){var y=sy+r;if(y<0||y>=ch)continue;var ay=fy?ch-1-y:y;for(var c=0;c<sw;c++){var x=sx+c;if(x<0||x>=cw)continue;var i=(r*sw+c)*4;if(px[i+3]!==255)continue;var a=(ay*cw+x)*4;px[i]=Math.max(0,Math.min(255,px[i]+__pn(s,a,px[i])));px[i+1]=Math.max(0,Math.min(255,px[i+1]+__pn(s,a+1,px[i+1])));px[i+2]=Math.max(0,Math.min(255,px[i+2]+__pn(s,a+2,px[i+2])));}}}
  if(typeof OffscreenCanvas!=='undefined'){
    var _oCtB=OffscreenCanvas.prototype.convertToBlob;
    var _oGID=(typeof OffscreenCanvasRenderingContext2D!=='undefined')?OffscreenCanvasRenderingContext2D.prototype.getImageData:null;
    if(_oGID){OffscreenCanvasRenderingContext2D.prototype.getImageData=function(sx,sy,sw,sh){var id=_oGID.apply(this,arguments);try{__ar(id.data,__s,sx,sy,sw,sh,this.canvas.width,this.canvas.height,false);}catch(e){}return id;};}
    // 0057r3: export a noisy clone drawn from the canvas itself (WebGL / bitmaprenderer
    // canvases too; no 2D context created on the source); WebGPU canvases stay native.
    var __gpuC=(typeof WeakSet!=='undefined')?new WeakSet():null;
    var _oGC=OffscreenCanvas.prototype.getContext;
    if(__gpuC&&typeof _oGC==='function'&&typeof navigator!=='undefined'&&navigator&&navigator.gpu){OffscreenCanvas.prototype.getContext=function(){var r=_oGC.apply(this,arguments);try{if(r&&String(arguments[0])==='webgpu')__gpuC.add(this);}catch(e){}return r;};}
    OffscreenCanvas.prototype.convertToBlob=function(){try{var w=this.width,h=this.height;if(w>0&&h>0&&!(__gpuC&&__gpuC.has(this))){var t=new OffscreenCanvas(w,h),c=t.getContext('2d');c.drawImage(this,0,0);var id=_oGID?_oGID.call(c,0,0,w,h):c.getImageData(0,0,w,h);__ar(id.data,__s,0,0,w,h,w,h,false);c.putImageData(id,0,0);return _oCtB.apply(t,arguments);}}catch(e){}return _oCtB.apply(this,arguments);};
  }
  if(typeof WebGLRenderingContext!=='undefined'){var _rp=WebGLRenderingContext.prototype.readPixels;WebGLRenderingContext.prototype.readPixels=function(x,y,w,h,f,t,p){var ret=_rp.apply(this,arguments);if(p&&typeof p==='object'&&arguments.length<=7&&f===0x1908&&t===0x1401){try{__ar(p,__s,x,y,w,h,this.drawingBufferWidth,this.drawingBufferHeight,true);}catch(e){}}return ret;};}
  if(typeof WebGL2RenderingContext!=='undefined'){var _rp2=WebGL2RenderingContext.prototype.readPixels;WebGL2RenderingContext.prototype.readPixels=function(x,y,w,h,f,t,p){var ret=_rp2.apply(this,arguments);if(p&&typeof p==='object'&&arguments.length<=7&&f===0x1908&&t===0x1401){try{__ar(p,__s,x,y,w,h,this.drawingBufferWidth,this.drawingBufferHeight,true);}catch(e){}}return ret;};}
  // 0057: fonts parity with the window (DepthHooksChild 0036): OffscreenCanvas
  // measureText width x the same fontSeed fudge, so page and worker agree.
  var __fs=${typeof depth.fontSeed === "number" ? (depth.fontSeed >>> 0) : -1};
  if(__fs>=0&&typeof OffscreenCanvasRenderingContext2D!=='undefined'&&typeof OffscreenCanvasRenderingContext2D.prototype.measureText==='function'){
    var __ff=0.999+((__fs/4294967295)/1000);
    var __fw=function(w){return(typeof w!=='number'||!isFinite(w)||w===0)?w:w*__ff;};
    var _oMT=OffscreenCanvasRenderingContext2D.prototype.measureText;
    var __props=["actualBoundingBoxLeft","actualBoundingBoxRight","actualBoundingBoxAscent","actualBoundingBoxDescent","fontBoundingBoxAscent","fontBoundingBoxDescent","emHeightAscent","emHeightDescent","hangingBaseline","alphabeticBaseline","ideographicBaseline"];
    Object.defineProperty(OffscreenCanvasRenderingContext2D.prototype,"measureText",{configurable:true,enumerable:true,writable:true,value:function(text){var m=_oMT.apply(this,arguments);if(!m)return m;var w=m.width,fw=__fw(w);if(fw===w)return m;var out={width:fw};for(var i=0;i<__props.length;i++){var k=__props[i];try{var v=m[k];if(typeof v==='number'){out[k]=(k==="actualBoundingBoxLeft"||k==="actualBoundingBoxRight")?__fw(v):v;}}catch(e){}}return out;}});
  }
  var __gv=${JSON.stringify(vendor)},__gr=${JSON.stringify(rendererUnmasked)},__grm=${JSON.stringify(rendererMasked)};
  function __gs(p,v){if(typeof v!=='string'||v.indexOf('Mozilla')===0)return v;if(p===0x9245)return __gv;if(p===0x1F01)return __grm;return __gr;}
  if(typeof WebGLRenderingContext!=='undefined'){var _gp=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(p){if(p===0x9245||p===0x9246||p===0x1F01)return __gs(p,_gp.call(this,p));return _gp.call(this,p);};}
  if(typeof WebGL2RenderingContext!=='undefined'){var _gp2=WebGL2RenderingContext.prototype.getParameter;WebGL2RenderingContext.prototype.getParameter=function(p){if(p===0x9245||p===0x9246||p===0x1F01)return __gs(p,_gp2.call(this,p));return _gp2.call(this,p);};}
})();`;
}


/**
 * 0057r3: WebGPU body, byte-identical to DarkstrDepthHooksChild WEBGPU_BODY
 * (tests/depth-per-site-0057 checks): real features / limits / device, persona
 * AdapterInfo; an Intel persona hides only Apple-silicon-only texture formats.
 * Idle when navigator.gpu is absent (LibreWolf dom.webgpu.enabled default false).
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

export function buildWebGpuOverrides(depth) {
  if (!depth || typeof depth.webgpuSeed !== "number") {
    return "";
  }
  const seed = depth.webgpuSeed >>> 0;
  const vendor = depth.gpu?.vendor || "Apple";
  const renderer = depth.gpu?.renderer || "Apple M1";
  return `
;(function(seed,gpuVendor,gpuRenderer){try{(function(){${WEBGPU_BODY}
}).call(this);}catch(_e){}})(${seed},${JSON.stringify(vendor)},${JSON.stringify(renderer)});`;
}

/** Depth prelude for one worker ("" when depth is not armed). */
export function buildWorkerPrelude(depth) {
  if (!depth) {
    return "";
  }
  return buildDepthOverrides(depth) + buildWebGpuOverrides(depth);
}

function bagString(bag, key) {
  try {
    return String(bag.getPropertyAsAString(key) || "");
  } catch (_e) {
    return "";
  }
}

function bagU64(bag, key) {
  try {
    return Number(bag.getPropertyAsUint64(key)) || 0;
  } catch (_e) {
    return 0;
  }
}

/** Request fields C++ put in the bag. */
export function readWorkerRequest(bag) {
  return {
    kind: bagString(bag, "kind") || "dedicated",
    scriptURL: bagString(bag, "scriptURL"),
    innerWindowId: bagU64(bag, "innerWindowId"),
    principalOrigin: bagString(bag, "principalOrigin"),
    partitionKey: bagString(bag, "partitionKey"),
    // 0056: persona context of the worker (containers / private browsing).
    userContextId: bagU64(bag, "userContextId"),
    privateBrowsingId: bagU64(bag, "privateBrowsingId"),
  };
}

/**
 * Write a resolve result back for C++. Navigator fields only when the
 * decision is "persona"; empty = native (plain Firefox value).
 */
export function fillWorkerPersonaBag(bag, result) {
  const persona = result?.decision === "persona" ? result.persona : null;
  if (persona?.userAgent) {
    bag.setPropertyAsAString("userAgent", String(persona.userAgent));
    bag.setPropertyAsAString("platform", String(persona.platform || ""));
    const hc = Number(persona.hardwareConcurrency) >>> 0;
    if (hc > 0) {
      bag.setPropertyAsUint32("hardwareConcurrency", hc);
    }
    const langs = Array.isArray(persona.languages)
      ? persona.languages.map(String).filter(Boolean)
      : [];
    if (langs.length) {
      bag.setPropertyAsAString("languages", langs.join(","));
    }
    if (persona.timezone) {
      bag.setPropertyAsAString("timezone", String(persona.timezone));
    }
    // 0058: WorkerNavigator.appVersion follows the persona's OS too.
    if (persona.appVersion) {
      bag.setPropertyAsAString("appVersion", String(persona.appVersion));
    }
  }
  const prelude = persona ? buildWorkerPrelude(result.depth) : "";
  if (prelude) {
    bag.setPropertyAsAString("prelude", prelude);
  }
  return !!persona?.userAgent;
}

export class DarkstrWorkerPersonaChild extends JSProcessActorChild {
  observe(subject, topic, _data) {
    if (topic !== TOPIC) {
      return;
    }
    let bag;
    try {
      bag = subject.QueryInterface(Ci.nsIWritablePropertyBag2);
    } catch (_e) {
      return;
    }
    let result = null;
    try {
      const replies = Services.cpmm.sendSyncMessage(
        MSG_RESOLVE,
        readWorkerRequest(bag)
      );
      result = Array.isArray(replies) ? replies[0] : null;
    } catch (e) {
      console.error("darkstr 0049: worker persona resolve failed", e);
      return;
    }
    try {
      fillWorkerPersonaBag(bag, result);
    } catch (e) {
      console.error("darkstr 0049: worker persona bag write failed", e);
    }
  }
}

/**
 * Retired (0049): the Phase 3 window actor that wrapped Worker/SharedWorker.
 * Kept as a no-op so a still-running pre-0049 parent that registered the
 * old "DarkstrWorkerHooks" window actor loads this module cleanly.
 */
export class DarkstrWorkerHooksChild extends JSWindowActorChild {
  handleEvent(_event) {}
}
