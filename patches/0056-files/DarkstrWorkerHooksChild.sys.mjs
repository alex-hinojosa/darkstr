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

export function buildDepthOverrides(depth) {
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
export function buildWebGpuOverrides(depth) {
  if (!depth || typeof depth.webgpuSeed !== "number") {
    return "";
  }
  const seed = depth.webgpuSeed >>> 0;
  const vendor = depth.gpu?.vendor || "Apple";
  const renderer = depth.gpu?.renderer || "Apple M1";
  // Body mirrors DepthHooksChild installWebGpuInPage (window 0038) — kept in the
  // worker compartment via the native 0049 prelude (no chrome Xray channel).
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
    // Soft residual (0043 re-XOR): idempotent — Window DepthHooks may share
    // GPU.prototype with Worker; a second wrapFeatures on plain farbled feats
    // dropped timestamp-query (14→13) and broke window↔worker digest parity.
    try {
      if (nativeFeatures && nativeFeatures.__darkstrFeats) {
        return nativeFeatures;
      }
      // DepthHooks window wrap may share GPU.prototype and already return a
      // plain {has,forEach,size} object (Object.prototype / null). Re-subsetting
      // drops another seed-ranked feature (14→13) and breaks digest parity.
      var featsProto = Object.getPrototypeOf(nativeFeatures);
      if (featsProto === Object.prototype || featsProto === null) {
        return nativeFeatures;
      }
    } catch (_idem) {}
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
      get size() { return kept.length; },
      __darkstrFeats: true
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
    try {
      if (nativeLimits && nativeLimits.__darkstrLimits) {
        return nativeLimits;
      }
      var limProto = Object.getPrototypeOf(nativeLimits);
      if (limProto === Object.prototype || limProto === null) {
        return nativeLimits;
      }
    } catch (_idemL) {}
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
    snapped.__darkstrLimits = true;
    return snapped;
  }
  function wrapInfo(nativeInfo) {
    try {
      if (nativeInfo && nativeInfo.__darkstrInfo) {
        return nativeInfo;
      }
      var infoProto = Object.getPrototypeOf(nativeInfo);
      if (
        nativeInfo &&
        typeof nativeInfo.vendor === "string" &&
        (infoProto === Object.prototype || infoProto === null)
      ) {
        return nativeInfo;
      }
    } catch (_idemI) {}
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
    out.__darkstrInfo = true;
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
    try {
      if (adapter.__darkstrWebGpuWrapped) {
        return adapter;
      }
    } catch (_idemA) {}
    try {
      Object.defineProperty(adapter, "__darkstrWebGpuWrapped", {
        configurable: true, value: true
      });
    } catch (_mark) {}
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
    try {
      if (origRA && origRA.__darkstrWebGpuRA) {
        // Our RA already on this proto — still ensure instance own-property.
        if (gpuObj) {
          try {
            Object.defineProperty(gpuObj, "requestAdapter", {
              configurable: true, enumerable: true, writable: true, value: origRA
            });
          } catch (_reInst) {}
        }
        return;
      }
    } catch (_have) {}
    var wrappedRA = function(options) {
      var self = this;
      return Promise.resolve(origRA.apply(self, arguments)).then(function(adapter) {
        if (!adapter) { return null; }
        return wrapAdapter(adapter);
      });
    };
    try { wrappedRA.__darkstrWebGpuRA = true; } catch (_markRA) {}
    // Prefer own-property on the navigator.gpu instance (WorkerNavigator.gpu is
    // SameObject) so we do not stack on a Window DepthHooks proto wrap when
    // GPU.prototype is process-shared with the page.
    var instOk = false;
    if (gpuObj) {
      try {
        Object.defineProperty(gpuObj, "requestAdapter", {
          configurable: true, enumerable: true, writable: true, value: wrappedRA
        });
        instOk = true;
      } catch (_inst) { instOk = false; }
    }
    if (!instOk) {
      try {
        Object.defineProperty(gpuProto, "requestAdapter", {
          configurable: true, enumerable: true, writable: true, value: wrappedRA
        });
      } catch (_def) {
        try { gpuProto.requestAdapter = wrappedRA; } catch (_e2) {}
      }
    }
  }
})();`;
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
