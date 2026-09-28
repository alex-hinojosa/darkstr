/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 pin 3 — JSWindowActor child.
 * Wrap DedicatedWorker / SharedWorker constructors so worker globals stay
 * persona-coherent (navigator + OffscreenCanvas/WebGL/WebGPU depth). Phase 1
 * parity via blob importScripts / dynamic import; ServiceWorker NOT claimed.
 * Soft residual (0043): WorkerNavigator.gpu wraps with same seed-tied coherence
 * as window 0038 (plain AdapterInfo/features/limits; idle when navigator.gpu
 * absent). ServiceWorker still OOS (register ≠ Worker blob). Brand: darkstr —
 * not official LibreWolf.
 *
 * Fission note: waive content window + Cu.exportFunction replacements.
 * pageshow reinstall; surface lastError via InstallStatus IPC.
 */

const installedByWindow = new WeakMap();

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

function methodIsInstalled(replacement) {
  try {
    return (
      Object.getOwnPropertyDescriptor(replacement.holder, replacement.name)
        ?.value === replacement.wrapper
    );
  } catch (_e) {
    return false;
  }
}

function restoreReplacement(replacement) {
  if (methodIsInstalled(replacement)) {
    Object.defineProperty(
      replacement.holder,
      replacement.name,
      replacement.originalDescriptor
    );
  }
}

function uninstallWorkerHooks(rawWindow) {
  const record = installedByWindow.get(rawWindow);
  if (!record) {
    return "idle";
  }
  for (const replacement of record.replacements.slice().reverse()) {
    restoreReplacement(replacement);
  }
  installedByWindow.delete(rawWindow);
  return "uninstalled";
}

function buildNavigatorOverrides(persona) {
  const langs = Array.isArray(persona.languages)
    ? persona.languages
    : ["en-US", "en"];
  const appVersion = String(persona.userAgent || "").replace(/^Mozilla\//, "");
  const hw = Number(persona.hardwareConcurrency) || 8;
  const mem = Number(persona.deviceMemory) || 8;
  // Prefer own-property overrides on the navigator instance. WorkerNavigator
  // prototype hardwareConcurrency is often non-configurable from C++; proto
  // defineProperty then silently fails and Proof still sees host cores.
  return `
(function(){
  try {
    var nav = self.navigator;
    if (!nav) { return; }
    var proto = nav.__proto__;
    function def(obj, prop, getter) {
      if (!obj) { return false; }
      try {
        Object.defineProperty(obj, prop, { configurable: true, enumerable: true, get: getter });
        return true;
      } catch (_e) { return false; }
    }
    function spoof(prop, getter) {
      if (def(nav, prop, getter)) { return true; }
      return def(proto, prop, getter);
    }
    spoof("userAgent", function(){ return ${JSON.stringify(persona.userAgent)}; });
    spoof("platform", function(){ return ${JSON.stringify(persona.platform || "MacIntel")}; });
    // Best-effort: instance first, then proto. If both refuse (non-configurable
    // host binding), hardwareConcurrency residual stays host — documented.
    spoof("hardwareConcurrency", function(){ return ${hw}; });
    spoof("deviceMemory", function(){ return ${mem}; });
    spoof("language", function(){ return ${JSON.stringify(langs[0] || "en-US")}; });
    spoof("languages", function(){ return Object.freeze(${JSON.stringify(langs)}); });
    spoof("appVersion", function(){ return ${JSON.stringify(appVersion)}; });
  } catch (_e) {}
})();`;
}

function buildDepthOverrides(depth) {
  if (!depth || typeof depth.canvasSeed !== "number") {
    return "";
  }
  const seed = depth.canvasSeed >>> 0;
  const vendor = depth.gpu?.vendor || "Apple";
  const renderer = depth.gpu?.renderer || "Apple M1";
  return `
;(function(){
  var __s=${seed};
  function __pn(s,i,v){var h=s^(i*2654435761);h=(h^(v*2246822519))>>>0;h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);h=(h^(h>>>16))>>>0;var m=(h>>>1)&3;return(h&1)?m:-m;}
  function __an(px,s){for(var i=0;i<px.length;i+=4){px[i]=Math.max(0,Math.min(255,px[i]+__pn(s,i,px[i])));px[i+1]=Math.max(0,Math.min(255,px[i+1]+__pn(s,i+1,px[i+1])));px[i+2]=Math.max(0,Math.min(255,px[i+2]+__pn(s,i+2,px[i+2])));}}
  if(typeof OffscreenCanvas!=='undefined'){
    var _oCtB=OffscreenCanvas.prototype.convertToBlob;
    var _oGID=(typeof OffscreenCanvasRenderingContext2D!=='undefined')?OffscreenCanvasRenderingContext2D.prototype.getImageData:null;
    if(_oGID){OffscreenCanvasRenderingContext2D.prototype.getImageData=function(){var id=_oGID.apply(this,arguments);__an(id.data,__s);return id;};}
    OffscreenCanvas.prototype.convertToBlob=function(){try{if(this.width>0&&this.height>0){var c=this.getContext('2d');if(c){var id=_oGID?_oGID.call(c,0,0,this.width,this.height):c.getImageData(0,0,this.width,this.height);__an(id.data,__s);var t=new OffscreenCanvas(this.width,this.height);t.getContext('2d').putImageData(id,0,0);return _oCtB.apply(t,arguments);}}}catch(e){}return _oCtB.apply(this,arguments);};
  }
  if(typeof WebGLRenderingContext!=='undefined'){var _rp=WebGLRenderingContext.prototype.readPixels;WebGLRenderingContext.prototype.readPixels=function(x,y,w,h,f,t,p){_rp.call(this,x,y,w,h,f,t,p);if(p&&f===0x1908&&t===0x1401)__an(p,__s);};}
  if(typeof WebGL2RenderingContext!=='undefined'){var _rp2=WebGL2RenderingContext.prototype.readPixels;WebGL2RenderingContext.prototype.readPixels=function(x,y,w,h,f,t,p){_rp2.call(this,x,y,w,h,f,t,p);if(p&&f===0x1908&&t===0x1401)__an(p,__s);};}
  var __gv=${JSON.stringify(vendor)},__gr=${JSON.stringify(renderer)};
  if(typeof WebGLRenderingContext!=='undefined'){var _gp=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(p){if(p===0x9245)return __gv;if(p===0x9246)return __gr;return _gp.call(this,p);};}
  if(typeof WebGL2RenderingContext!=='undefined'){var _gp2=WebGL2RenderingContext.prototype.getParameter;WebGL2RenderingContext.prototype.getParameter=function(p){if(p===0x9245)return __gv;if(p===0x9246)return __gr;return _gp2.call(this,p);};}
})();`;
}


/**
 * Soft residual (0043): inject 0038-parity WebGPU wrap into worker globals.
 * Idle when navigator.gpu / requestAdapter absent (LibreWolf dom.webgpu.enabled
 * default false — no invent). Plain objects + defineProperty overlay (0038
 * Xray/Marionette lessons). Never invent Chrome adapter brands. AdapterInfo.device
 * stays "". ServiceWorker NOT claimed here.
 */
function buildWebGpuOverrides(depth) {
  if (!depth || typeof depth.webgpuSeed !== "number") {
    return "";
  }
  const seed = depth.webgpuSeed >>> 0;
  const vendor = depth.gpu?.vendor || "Apple";
  const renderer = depth.gpu?.renderer || "Apple M1";
  // Body mirrors DepthHooksChild installWebGpuInPage (window 0038) — kept in the
  // worker compartment via blob preamble (no chrome Xray channel).
  return `
;(function(){
  try {
    if (typeof navigator === "undefined" || !navigator || !navigator.gpu ||
        typeof navigator.gpu.requestAdapter !== "function") {
      return;
    }
  } catch (_abs) { return; }
  var SEED = ${seed} >>> 0;
  var VENDOR = ${JSON.stringify(vendor)};
  var RENDERER = ${JSON.stringify(renderer)};
  function hashStr(s) {
    var h = SEED;
    var str = String(s || "");
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function mapAdapterInfo() {
    var v = VENDOR.toLowerCase();
    var r = String(RENDERER || "");
    var desc = r;
    if (/apple/i.test(v) || /apple/i.test(r)) {
      return { vendor: "apple", architecture: "common-3", device: "", description: desc || "Apple GPU" };
    }
    if (/intel/i.test(v) || /intel/i.test(r)) {
      return { vendor: "intel", architecture: "gen-12lp", device: "", description: desc || "Intel Graphics" };
    }
    if (/nvidia/i.test(v) || /nvidia/i.test(r)) {
      return { vendor: "nvidia", architecture: "gpu", device: "", description: desc || "NVIDIA GPU" };
    }
    if (/amd/i.test(v) || /radeon/i.test(r)) {
      return { vendor: "amd", architecture: "gcn", device: "", description: desc || "AMD GPU" };
    }
    return { vendor: "apple", architecture: "common-3", device: "", description: desc || "Apple GPU" };
  }
  var PERSONA_INFO = mapAdapterInfo();
  var ALWAYS_KEEP_FEATURES = { "core-features-and-limits": 1 };
  function wrapFeatures(nativeFeatures) {
    if (!nativeFeatures) { return nativeFeatures; }
    var all = [];
    try {
      if (typeof nativeFeatures.forEach === "function") {
        nativeFeatures.forEach(function(name) { all.push(String(name)); });
      } else if (typeof nativeFeatures.values === "function") {
        var it = nativeFeatures.values();
        var step;
        while (!(step = it.next()).done) { all.push(String(step.value)); }
      }
    } catch (_e) { return nativeFeatures; }
    var always = [];
    var optional = [];
    for (var i = 0; i < all.length; i++) {
      if (ALWAYS_KEEP_FEATURES[all[i]]) { always.push(all[i]); }
      else { optional.push(all[i]); }
    }
    optional.sort(function(a, b) {
      var ra = hashStr("rank:" + a);
      var rb = hashStr("rank:" + b);
      if (ra !== rb) { return ra < rb ? -1 : 1; }
      if (a < b) { return -1; }
      if (a > b) { return 1; }
      return 0;
    });
    var drop = 0;
    if (optional.length > 0) {
      drop = 1 + (SEED % Math.min(3, optional.length));
      if (drop > optional.length) { drop = optional.length; }
      if (optional.length >= 2 && drop >= optional.length) { drop = optional.length - 1; }
    }
    var kept = always.concat(optional.slice(drop));
    if (!kept.length && all.length) { kept.push(all[0]); }
    var seen = Object.create(null);
    var uniq = [];
    for (var k = 0; k < kept.length; k++) {
      if (!seen[kept[k]]) { seen[kept[k]] = 1; uniq.push(kept[k]); }
    }
    kept = uniq;
    var set = Object.create(null);
    for (var j = 0; j < kept.length; j++) { set[kept[j]] = 1; }
    return {
      has: function(name) { return !!set[String(name)]; },
      values: function() {
        var idx = 0;
        return {
          next: function() {
            if (idx >= kept.length) { return { done: true, value: undefined }; }
            return { done: false, value: kept[idx++] };
          },
          [Symbol.iterator]: function() { return this; }
        };
      },
      keys: function() { return this.values(); },
      entries: function() {
        var idx = 0;
        return {
          next: function() {
            if (idx >= kept.length) { return { done: true, value: undefined }; }
            var kk = kept[idx++];
            return { done: false, value: [kk, kk] };
          },
          [Symbol.iterator]: function() { return this; }
        };
      },
      forEach: function(cb, thisArg) {
        for (var j2 = 0; j2 < kept.length; j2++) {
          cb.call(thisArg, kept[j2], kept[j2], this);
        }
      },
      get size() { return kept.length; }
    };
  }
  var FUDGE_LIMIT_KEYS = {
    maxTextureDimension1D: 1, maxTextureDimension2D: 1, maxTextureDimension3D: 1,
    maxTextureArrayLayers: 1, maxBindGroups: 1,
    maxSampledTexturesPerShaderStage: 1, maxSamplersPerShaderStage: 1,
    maxStorageBuffersPerShaderStage: 1, maxUniformBuffersPerShaderStage: 1,
    maxUniformBufferBindingSize: 1, maxStorageBufferBindingSize: 1,
    maxBufferSize: 1, maxVertexBuffers: 1, maxVertexAttributes: 1,
    maxColorAttachments: 1, maxComputeWorkgroupStorageSize: 1,
    maxComputeInvocationsPerWorkgroup: 1, maxComputeWorkgroupsPerDimension: 1
  };
  function fudgeLimit(key, nativeVal) {
    var n = Number(nativeVal);
    if (!isFinite(n) || n <= 0) { return nativeVal; }
    if (!FUDGE_LIMIT_KEYS[key]) { return nativeVal; }
    var fudge = 0.99 + ((hashStr("lim:" + key) % 1000) / 100000);
    var out = Math.floor(n * fudge);
    if (out < 1) { out = 1; }
    if (out > n) { out = n; }
    return out;
  }
  function wrapLimits(nativeLimits) {
    if (!nativeLimits) { return nativeLimits; }
    var snapped = Object.create(null);
    var snapKeys = Object.keys(FUDGE_LIMIT_KEYS).concat([
      "minUniformBufferOffsetAlignment", "minStorageBufferOffsetAlignment",
      "maxBindGroupsPlusVertexBuffers",
      "maxDynamicUniformBuffersPerPipelineLayout",
      "maxDynamicStorageBuffersPerPipelineLayout",
      "maxComputeWorkgroupSizeX", "maxComputeWorkgroupSizeY", "maxComputeWorkgroupSizeZ",
      "maxInterStageShaderVariables", "maxColorAttachmentBytesPerSample"
    ]);
    for (var si = 0; si < snapKeys.length; si++) {
      var sk = snapKeys[si];
      var sv;
      try { sv = nativeLimits[sk]; } catch (_se) { continue; }
      if (typeof sv === "number" || typeof sv === "bigint") {
        snapped[sk] = fudgeLimit(sk, Number(sv));
      }
    }
    return snapped;
  }
  function wrapInfo(nativeInfo) {
    var base = PERSONA_INFO;
    var out = {
      vendor: String(base.vendor || ""),
      architecture: String(base.architecture || ""),
      device: String(base.device || ""),
      description: String(base.description || "")
    };
    try {
      if (nativeInfo && typeof nativeInfo.isFallbackAdapter === "boolean") {
        out.isFallbackAdapter = nativeInfo.isFallbackAdapter;
      }
    } catch (_e) {}
    try {
      if (nativeInfo && typeof nativeInfo.subgroupMinSize === "number") {
        out.subgroupMinSize = nativeInfo.subgroupMinSize;
      }
      if (nativeInfo && typeof nativeInfo.subgroupMaxSize === "number") {
        out.subgroupMaxSize = nativeInfo.subgroupMaxSize;
      }
    } catch (_e2) {}
    return out;
  }
  function wrapDevice(device, sharedFeatures, sharedLimits, sharedInfo) {
    if (!device) { return device; }
    var featCache = sharedFeatures || null;
    var limCache = sharedLimits || null;
    var infoCache = sharedInfo || null;
    function ensureFeat() {
      if (!featCache) { featCache = wrapFeatures(device.features); }
      return featCache;
    }
    function ensureLim() {
      if (!limCache) { limCache = wrapLimits(device.limits); }
      return limCache;
    }
    function ensureInfo() {
      if (!infoCache) { infoCache = wrapInfo(device.adapterInfo); }
      return infoCache;
    }
    var overlaid = false;
    try {
      var f = ensureFeat();
      var l = ensureLim();
      var i = ensureInfo();
      Object.defineProperty(device, "features", {
        configurable: true, enumerable: true, get: function() { return f; }
      });
      Object.defineProperty(device, "limits", {
        configurable: true, enumerable: true, get: function() { return l; }
      });
      Object.defineProperty(device, "adapterInfo", {
        configurable: true, enumerable: true, get: function() { return i; }
      });
      overlaid = true;
    } catch (_defErr) { overlaid = false; }
    if (overlaid) { return device; }
    return new Proxy(device, {
      get: function(target, prop, receiver) {
        if (typeof prop === "symbol") { return Reflect.get(target, prop, target); }
        var key = String(prop);
        if (key === "features") { return ensureFeat(); }
        if (key === "limits") { return ensureLim(); }
        if (key === "adapterInfo") { return ensureInfo(); }
        var raw;
        try { raw = target[prop]; } catch (_e) { return undefined; }
        if (typeof raw === "function") { return raw.bind(target); }
        return raw;
      }
    });
  }
  function wrapAdapter(adapter) {
    if (!adapter) { return adapter; }
    var featCache = null;
    var limCache = null;
    var infoCache = null;
    function getFeat() {
      if (!featCache) { featCache = wrapFeatures(adapter.features); }
      return featCache;
    }
    function getLim() {
      if (!limCache) { limCache = wrapLimits(adapter.limits); }
      return limCache;
    }
    function getInfo() {
      if (!infoCache) { infoCache = wrapInfo(adapter.info); }
      return infoCache;
    }
    return new Proxy(adapter, {
      get: function(target, prop, receiver) {
        if (typeof prop === "symbol") { return Reflect.get(target, prop, target); }
        var key = String(prop);
        if (key === "features") { return getFeat(); }
        if (key === "limits") { return getLim(); }
        if (key === "info") { return getInfo(); }
        if (key === "requestDevice") {
          var origRD = target.requestDevice;
          return function(desc) {
            var farbled = getFeat();
            var newDesc;
            if (desc === undefined || desc === null) { newDesc = {}; }
            else {
              try { newDesc = Object.assign({}, desc); }
              catch (_eAssign) { newDesc = desc; }
            }
            if (newDesc && typeof newDesc === "object") {
              var reqIn = newDesc.requiredFeatures;
              var reqOut = [];
              if (reqIn && typeof reqIn.length === "number" && reqIn.length > 0) {
                for (var ri = 0; ri < reqIn.length; ri++) {
                  var fn = String(reqIn[ri]);
                  if (!farbled.has(fn)) {
                    return Promise.reject(new TypeError(
                      "Failed to execute 'requestDevice' on 'GPUAdapter': " +
                      "Invalid feature call. Missing feature: " + fn
                    ));
                  }
                  reqOut.push(fn);
                }
                newDesc.requiredFeatures = reqOut;
              }
            }
            function finish(dev) {
              return wrapDevice(dev, getFeat(), getLim(), getInfo());
            }
            return Promise.resolve(origRD.call(target, newDesc)).then(finish);
          };
        }
        var raw;
        try { raw = target[prop]; } catch (_e) { return undefined; }
        if (typeof raw === "function") { return raw.bind(target); }
        return raw;
      }
    });
  }
  var gpuObj = null;
  try {
    if (typeof navigator !== "undefined" && navigator && navigator.gpu) {
      gpuObj = navigator.gpu;
    }
  } catch (_e) {}
  var gpuProto = null;
  if (gpuObj) { gpuProto = Object.getPrototypeOf(gpuObj); }
  if (!gpuProto && typeof GPU !== "undefined" && GPU.prototype) {
    gpuProto = GPU.prototype;
  }
  if (gpuProto && typeof gpuProto.requestAdapter === "function") {
    var origRA = gpuProto.requestAdapter;
    var wrappedRA = function(options) {
      var self = this;
      return Promise.resolve(origRA.apply(self, arguments)).then(function(adapter) {
        if (!adapter) { return null; }
        return wrapAdapter(adapter);
      });
    };
    try {
      Object.defineProperty(gpuProto, "requestAdapter", {
        configurable: true, enumerable: true, writable: true, value: wrappedRA
      });
    } catch (_def) {
      try { gpuProto.requestAdapter = wrappedRA; } catch (_e2) {}
    }
  }
})();`;
}

function buildNestedWorkerWrapper(leafOverrides) {
  return `
;(function(){
  if(typeof Worker!=='undefined'){
    var _OW=Worker;
    var _ovr=${JSON.stringify(leafOverrides)};
    self.Worker=function(u,o){
      try{
        var ru=new URL(u,self.location.href).href;
        if(o&&o.type==='module'){
          var b=new Blob([_ovr+';\\nawait import('+JSON.stringify(ru)+');'],{type:'application/javascript'});
          return new _OW(URL.createObjectURL(b),Object.assign({},o,{type:'module'}));
        }else{
          var b=new Blob([_ovr+';\\nimportScripts('+JSON.stringify(ru)+');'],{type:'application/javascript'});
          return new _OW(URL.createObjectURL(b),o);
        }
      }catch(e){return new _OW(u,o);}
    };
    self.Worker.prototype=_OW.prototype;
  }
})();`;
}

function buildAllOverrides(payload) {
  const nav = buildNavigatorOverrides(payload.persona);
  const depth = buildDepthOverrides(payload.depth);
  const webgpu = buildWebGpuOverrides(payload.depth);
  const leaf = nav + depth + webgpu;
  return leaf + buildNestedWorkerWrapper(leaf);
}

function isSameOriginOrBlob(pageWindow, urlStr) {
  try {
    if (typeof urlStr === "string" && urlStr.startsWith("blob:")) {
      return true;
    }
    const parsed = new pageWindow.URL(urlStr, pageWindow.location.href);
    return parsed.origin === pageWindow.location.origin;
  } catch (_e) {
    return false;
  }
}

function replaceConstructor(pageWindow, name, implementation, replacements) {
  const holder = pageWindow;
  const descriptor = Object.getOwnPropertyDescriptor(holder, name);
  if (!descriptor || typeof descriptor.value !== "function") {
    // Some builds expose Worker only on the prototype chain / as a value without descriptor.
    const existing = holder[name];
    if (typeof existing !== "function") {
      throw new Error(`${name} constructor unavailable`);
    }
    const wrapper = Cu.exportFunction(implementation, pageWindow);
    holder[name] = wrapper;
    try {
      wrapper.prototype = existing.prototype;
    } catch (_e) {}
    replacements.push({
      holder,
      name,
      wrapper,
      originalDescriptor: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: existing,
      },
      _loose: true,
    });
    return existing;
  }
  const original = descriptor.value;
  const wrapper = Cu.exportFunction(implementation, pageWindow);
  try {
    wrapper.prototype = original.prototype;
  } catch (_e) {}
  Object.defineProperty(holder, name, { ...descriptor, value: wrapper });
  replacements.push({
    holder,
    name,
    wrapper,
    originalDescriptor: descriptor,
  });
  return original;
}

function installWorkerHooks(rawWindow, payload, onRuntimeError) {
  const prior = installedByWindow.get(rawWindow);
  if (prior && prior.replacements.every(methodIsInstalled)) {
    return "already-installed";
  }
  if (prior) {
    uninstallWorkerHooks(rawWindow);
  }

  const pageWindow = contentWindowFor(rawWindow);
  if (!payload?.persona?.userAgent) {
    throw new Error("persona payload unavailable");
  }
  const replacements = [];
  const overrides = buildAllOverrides(payload);

  try {
    if (typeof pageWindow.Worker === "function") {
      const OrigWorker = replaceConstructor(
        pageWindow,
        "Worker",
        function (url, opts) {
          try {
            if (!isSameOriginOrBlob(pageWindow, url)) {
              return Reflect.construct(OrigWorker, [url, opts]);
            }
            const isModule = opts && opts.type === "module";
            const origUrl = new pageWindow.URL(url, pageWindow.location.href)
              .href;
            if (isModule) {
              const blob = new pageWindow.Blob(
                [overrides + `;\nawait import(${JSON.stringify(origUrl)});`],
                { type: "application/javascript" }
              );
              return Reflect.construct(OrigWorker, [
                pageWindow.URL.createObjectURL(blob),
                Object.assign({}, opts || {}, { type: "module" }),
              ]);
            }
            const blob = new pageWindow.Blob(
              [overrides + `;\nimportScripts(${JSON.stringify(origUrl)});`],
              { type: "application/javascript" }
            );
            return Reflect.construct(OrigWorker, [
              pageWindow.URL.createObjectURL(blob),
              opts,
            ]);
          } catch (error) {
            onRuntimeError("Worker", error);
            return Reflect.construct(OrigWorker, [url, opts]);
          }
        },
        replacements
      );
    }

    if (typeof pageWindow.SharedWorker === "function") {
      const OrigSharedWorker = replaceConstructor(
        pageWindow,
        "SharedWorker",
        function (url, nameOrOpts) {
          try {
            if (!isSameOriginOrBlob(pageWindow, url)) {
              return Reflect.construct(OrigSharedWorker, [url, nameOrOpts]);
            }
            const origUrl = new pageWindow.URL(url, pageWindow.location.href)
              .href;
            const blob = new pageWindow.Blob(
              [overrides + `;\nimportScripts(${JSON.stringify(origUrl)});`],
              { type: "application/javascript" }
            );
            return Reflect.construct(OrigSharedWorker, [
              pageWindow.URL.createObjectURL(blob),
              nameOrOpts,
            ]);
          } catch (error) {
            onRuntimeError("SharedWorker", error);
            return Reflect.construct(OrigSharedWorker, [url, nameOrOpts]);
          }
        },
        replacements
      );
    }

    if (!replacements.length) {
      throw new Error("Worker and SharedWorker constructors unavailable");
    }

    installedByWindow.set(rawWindow, { replacements });
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

export class DarkstrWorkerHooksChild extends JSWindowActorChild {
  _report(ok, eventType, status, error = "") {
    const detail = {
      ok: !!ok,
      event: String(eventType || "unknown"),
      status: String(status || "unknown"),
      error: error ? errorText(error).slice(0, 1000) : "",
    };
    try {
      this.sendAsyncMessage("DarkstrWorkerHooks:InstallStatus", detail);
    } catch (reportError) {
      console.error("darkstr worker diagnostic IPC failed", reportError, detail);
    }
  }

  /**
   * Construct-time fallback (blob wrap threw → OrigWorker). Must NOT clobber
   * lastInstall after a successful constructor wrap — Proof soft residual:
   * lastInstall often ended ok:false/runtime-Worker even when persona UA landed.
   * Runtime surfaces go to lastError only (runtimeOnly).
   */
  _reportRuntime(surface, error) {
    const detail = {
      ok: false,
      event: "runtime",
      status: `runtime-${surface}`,
      error: error ? errorText(error).slice(0, 1000) : "",
      runtimeOnly: true,
    };
    try {
      this.sendAsyncMessage("DarkstrWorkerHooks:InstallStatus", detail);
    } catch (reportError) {
      console.error("darkstr worker runtime diagnostic IPC failed", reportError, detail);
    }
  }

  async pullAndInstall(eventType) {
    let payload;
    try {
      payload = await this.sendQuery("DarkstrWorkerHooks:GetPayload");
    } catch (error) {
      console.error("darkstr worker payload IPC failed", error);
      this._report(false, eventType, "payload-query-failed", error);
      return;
    }

    const rawWindow = this.contentWindow;
    if (!rawWindow) {
      this._report(false, eventType, "no-content-window", "contentWindow unavailable");
      return;
    }

    if (!payload || !payload.persona || !payload.persona.userAgent) {
      try {
        const status = uninstallWorkerHooks(rawWindow);
        this._report(true, eventType, status);
      } catch (error) {
        console.error("darkstr worker uninstall failed", error);
        this._report(false, eventType, "uninstall-failed", error);
      }
      return;
    }

    try {
      const status = installWorkerHooks(rawWindow, payload, (surface, error) => {
        console.error(`darkstr worker runtime failure (${surface})`, error);
        this._reportRuntime(surface, error);
      });
      this._report(true, eventType, status);
    } catch (error) {
      console.error("darkstr worker install failed", error);
      this._report(false, eventType, "install-failed", error);
    }
  }

  async handleEvent(event) {
    if (event.type !== "DOMWindowCreated" && event.type !== "pageshow") {
      return;
    }
    await this.pullAndInstall(event.type);
  }
}
