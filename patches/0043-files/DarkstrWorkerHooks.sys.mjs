/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 pin 3 — DedicatedWorker / SharedWorker globals coherence (chrome).
 *
 * Train pin: Firefox / LibreWolf 155.0.1-1 (FIREFOX_155_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Mirrors public control plane (no Rust FFI required in this drop):
 *   duppel_bridge::DepthSurface::{DedicatedWorker,SharedWorker}
 *   duppel_bridge::HookApplicatorSurface::WorkerGlobals
 *   seed_source = persona_snapshot (+ depth seeds for OffscreenCanvas/WebGL/WebGPU in workers)
 *
 * Soft residual (0043): WorkerNavigator.gpu / DedicatedWorker+SharedWorker WebGPU
 * surfaces get the same seed-tied coherence as window 0038 (webgpuSeed + plain
 * AdapterInfo/features/limits; idle when navigator.gpu absent / pref off).
 * ServiceWorker / Worklets still NOT claimed (register path ≠ Worker blob wrap;
 * no Chrome invent). AdapterInfo.device stays empty (do not invent).
 *
 * Pattern: JSWindowActor patches window.Worker / window.SharedWorker (same as
 * Phase 1 WebExt misc.js) — workers have no window, so constructor wrap + blob
 * importScripts/import injects navigator + OffscreenCanvas/WebGL/WebGPU into the
 * worker global. Nested Worker wrap depth-limited to 2. Cross-origin workers pass
 * through (CSP-safe). ServiceWorker / Worklets NOT claimed.
 *
 * Gates (default-off — idle unless explicitly allowed):
 *   pollution_active = mode=="pollution" && !nativeCompatible
 *   allow = pollution_active && darkstr.nativePersonaHooks
 *   per-BC delivery also requires DocShell SubsequentNav arm when strictFirstDoc (0020)
 *   Global hooksArmed uses snapshot/prefs (Depth parity) — NOT snapshotForBrowsingContext(null)
 * Homogeneous / Native-Compatible / hooks false → no constructor wrap; payload null.
 *
 * Payload: prefer DarkstrNativePersona.snapshot + DarkstrDepthHooks depth seeds
 * (same persona coherence). Fallback reads darkstr.persona.snapshot / .seed.
 * Does not write privacy.*.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
const SNAPSHOT_PREF = "darkstr.persona.snapshot";
const SEED_PREF = "darkstr.persona.seed";
const DOCSHELL_PHASE_MIRROR_PREF = "darkstr.persona.docShellPhase";
const ARMED_PREF = "darkstr.worker.hooksArmed";
const LAST_PAYLOAD_PREF = "darkstr.worker.lastPayload";
const LAST_ERROR_PREF = "darkstr.worker.lastError";
const LAST_INSTALL_PREF = "darkstr.worker.lastInstall";


function deriveWebGpuSeed(speechOrCanvasSeed, audioSeed) {
  // Soft residual (0043): match DepthHooks deriveWebGpuSeed (speechSeed ⊕ audio).
  // Worker fallback may lack speechSeed — canvasSeed is an acceptable substitute
  // only when Depth plan did not supply webgpuSeed (rare offline path).
  return (speechOrCanvasSeed ^ Math.imul(audioSeed >>> 0, 0xc2b2ae35)) >>> 0;
}

function readWebGpuSeed(obj, speechOrCanvasSeed, audioSeed) {
  if (!obj || typeof obj !== "object") {
    return deriveWebGpuSeed(speechOrCanvasSeed >>> 0, audioSeed >>> 0);
  }
  for (const key of ["webgpuSeed", "webgpu_seed"]) {
    if (typeof obj[key] === "number" && Number.isFinite(obj[key])) {
      return obj[key] >>> 0;
    }
  }
  return deriveWebGpuSeed(speechOrCanvasSeed >>> 0, audioSeed >>> 0);
}

const GPU_BY_OS = {
  macos: [
    { vendor: "Apple", renderer: "Apple M1" },
    { vendor: "Apple", renderer: "Apple M2" },
    { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" },
  ],
  windows: [
    {
      vendor: "Google Inc. (Intel)",
      renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)",
    },
    {
      vendor: "Google Inc. (NVIDIA)",
      renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)",
    },
    {
      vendor: "Google Inc. (AMD)",
      renderer: "ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)",
    },
  ],
  linux: [
    { vendor: "Intel", renderer: "Mesa Intel(R) UHD Graphics 630 (CFL GT2)" },
    {
      vendor: "NVIDIA Corporation",
      renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2",
    },
    {
      vendor: "AMD",
      renderer:
        "AMD Radeon RX 580 (radeonsi, polaris10, LLVM 15.0.7, DRM 3.54, 6.8.0)",
    },
  ],
};

const UA_GROUPS = {
  macos: {
    platform: "MacIntel",
    uas: [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:135.0) Gecko/20100101 Firefox/135.0",
    ],
  },
  windows: {
    platform: "Win32",
    uas: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    ],
  },
  linux: {
    platform: "Linux x86_64",
    uas: [
      "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
    ],
  },
};

const CORES = [4, 8, 10, 12, 16];
const MEMORY = [4, 8, 16, 32];
const LANGUAGES = [
  ["en-US", "en"],
  ["en-GB", "en"],
  ["de-DE", "de", "en"],
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function detectHostOs() {
  try {
    const oscpu = Cc["@mozilla.org/network/protocol;1?name=http"].getService(
      Ci.nsIHttpProtocolHandler
    ).oscpu;
    if (/Mac OS X|macOS/i.test(oscpu)) {
      return "macos";
    }
    if (/Linux/i.test(oscpu)) {
      return "linux";
    }
  } catch (_e) {}
  return "windows";
}

function normalizeGpu(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const vendor = String(raw.vendor || "").trim();
  const renderer = String(raw.renderer || "").trim();
  if (!vendor || !renderer) {
    return null;
  }
  return { vendor, renderer };
}

function readU32Field(obj, camel, snake) {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  for (const k of [camel, snake]) {
    if (typeof obj[k] === "number" && Number.isFinite(obj[k])) {
      return obj[k] >>> 0;
    }
    if (typeof obj[k] === "string" && obj[k].trim() !== "") {
      const n = Number(obj[k]);
      if (Number.isFinite(n)) {
        return n >>> 0;
      }
    }
  }
  return null;
}

function normalizePersona(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const userAgent = String(raw.userAgent || raw.user_agent || "").trim();
  if (!userAgent) {
    return null;
  }
  const platform = String(raw.platform || "MacIntel");
  const hardwareConcurrency =
    Number(raw.hardwareConcurrency ?? raw.hardware_concurrency) || 8;
  const deviceMemory = Number(raw.deviceMemory ?? raw.device_memory) || 8;
  const languages = Array.isArray(raw.languages)
    ? raw.languages.map(String)
    : ["en-US", "en"];
  return {
    userAgent,
    platform,
    hardwareConcurrency,
    deviceMemory,
    languages,
  };
}

export var DarkstrWorkerHooks = {
  _inited: false,
  _actorRegistered: false,
  _observer: null,
  _payload: null,
  _armed: false,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._observer = this._observe.bind(this);
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF, SNAPSHOT_PREF, SEED_PREF, DOCSHELL_PHASE_MIRROR_PREF]) {
      Services.prefs.addObserver(p, this._observer);
    }
    this._registerActor();
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF, SNAPSHOT_PREF, SEED_PREF, DOCSHELL_PHASE_MIRROR_PREF]) {
      try {
        Services.prefs.removeObserver(p, this._observer);
      } catch (_e) {}
    }
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterWindowActor("DarkstrWorkerHooks");
      } catch (_e) {}
      this._actorRegistered = false;
    }
    this._setArmed(false, null);
    this._inited = false;
  },

  _observe(_subject, topic, _data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    this.refreshPlan();
  },

  _registerActor() {
    if (this._actorRegistered) {
      return;
    }
    try {
      ChromeUtils.registerWindowActor("DarkstrWorkerHooks", {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrWorkerHooksParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrWorkerHooksChild.sys.mjs",
          events: {
            DOMWindowCreated: {},
            pageshow: {},
          },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
        matches: ["*://*/*", "file://*"],
        // Required for Fission webIsolated / web content processes.
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    } catch (e) {
      console.error("darkstr P3: WorkerHooks JSWindowActor register failed:", e);
      this.recordInstallStatus({
        ok: false,
        event: "register",
        status: "register-failed",
        error: String(e?.stack || e?.message || e || "register failed"),
      });
    }
  },

  /**
   * Resolve worker gate + payload (persona + optional depth).
   * @returns {{
   *   pollutionActive: boolean,
   *   nativeHooks: boolean,
   *   armed: boolean,
   *   payload: object|null
   * }}
   */
  refreshPlan() {
    let mode = "homogeneous";
    try {
      mode = Services.prefs.getStringPref(MODE_PREF, "homogeneous");
    } catch (_e) {
      mode = "homogeneous";
    }
    if (mode !== "pollution" && mode !== "homogeneous") {
      mode = "homogeneous";
    }

    let nativeCompatible = false;
    try {
      nativeCompatible = Services.prefs.getBoolPref(NATIVE_PREF, false);
    } catch (_e) {}

    let nativeHooks = false;
    try {
      nativeHooks = Services.prefs.getBoolPref(HOOKS_PREF, false);
    } catch (_e) {}

    const pollutionActive = mode === "pollution" && !nativeCompatible;
    const payload = pollutionActive ? this._readWorkerPayload() : null;
    const armed = !!(pollutionActive && nativeHooks && payload?.persona);

    this._plan = {
      pollutionActive,
      nativeHooks,
      armed,
      payload: armed ? payload : null,
    };
    this._payload = this._plan.payload;
    this._setArmed(armed, this._payload);
    return this._plan;
  },

  getPlan() {
    return this._plan || this.refreshPlan();
  },

  /**
   * Persist content-install diagnostics. Never writes privacy.*.
   * Soft residual: runtime construct fallbacks set runtimeOnly and must not
   * overwrite lastInstall after a successful wrap (ok stays installed).
   */
  recordInstallStatus(detail, browsingContext = null) {
    const runtimeOnly = !!detail?.runtimeOnly;
    const payload = {
      ok: !!detail?.ok,
      event: String(detail?.event || "unknown"),
      status: String(detail?.status || "unknown"),
      error: String(detail?.error || "").slice(0, 1000),
      at: new Date().toISOString(),
    };
    try {
      if (browsingContext?.id != null) {
        payload.bc = browsingContext.id;
      }
    } catch (_e) {}
    if (runtimeOnly) {
      try {
        Services.prefs.setStringPref(
          LAST_ERROR_PREF,
          `runtime:${payload.status}:${payload.error}`.slice(0, 1000)
        );
      } catch (e) {
        console.error("darkstr worker lastError write failed", e);
      }
      return;
    }
    try {
      Services.prefs.setStringPref(LAST_INSTALL_PREF, JSON.stringify(payload));
    } catch (e) {
      console.error("darkstr worker lastInstall write failed", e);
    }
    try {
      if (payload.ok) {
        Services.prefs.setStringPref(LAST_ERROR_PREF, "");
      } else {
        Services.prefs.setStringPref(
          LAST_ERROR_PREF,
          `${payload.event}:${payload.status}:${payload.error}`.slice(0, 1000)
        );
      }
    } catch (e) {
      console.error("darkstr worker lastError write failed", e);
    }
  },

  /** Worker payload for JSWindowActor child (null when idle / first-doc). */
  workerPayloadForBrowsingContext(bc) {
    const plan = this.getPlan();
    if (!plan.armed || !plan.payload?.persona) {
      return null;
    }
    // SubsequentNav arm: null on first_document when strictFirstDoc.
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      if (DarkstrNativePersona.snapshotForBrowsingContext) {
        const snap = DarkstrNativePersona.snapshotForBrowsingContext(bc);
        if (!snap) {
          return null;
        }
      }
    } catch (_e) {
      try {
        const strictFirst = Services.prefs.getBoolPref(
          "darkstr.strictFirstDoc",
          true
        );
        if (strictFirst) {
          const phase = Services.prefs.getStringPref(
            "darkstr.persona.docShellPhase",
            ""
          );
          if (phase !== "subsequent_nav") {
            return null;
          }
        }
      } catch (_e2) {}
    }
    const persona = plan.payload.persona;
    const depth = plan.payload.depth || null;
    return {
      persona: {
        userAgent: persona.userAgent,
        platform: persona.platform,
        hardwareConcurrency: Number(persona.hardwareConcurrency) || 8,
        deviceMemory: Number(persona.deviceMemory) || 8,
        languages: Array.isArray(persona.languages)
          ? persona.languages.slice()
          : ["en-US", "en"],
      },
      depth: depth
        ? {
            canvasSeed: depth.canvasSeed >>> 0,
            audioSeed: depth.audioSeed >>> 0,
            webgpuSeed:
              depth.webgpuSeed != null
                ? depth.webgpuSeed >>> 0
                : readWebGpuSeed(
                    depth,
                    depth.canvasSeed >>> 0,
                    depth.audioSeed >>> 0
                  ),
            gpu: {
              vendor: depth.gpu.vendor,
              renderer: depth.gpu.renderer,
            },
          }
        : null,
    };
  },

  _readWorkerPayload() {
    // 0020 nextNavOk gate for global arm removed (0025) — SubsequentNav
    // idle remains in workerPayloadForBrowsingContext only.
    // Global arm payload (Depth parity): use plan snapshot / prefs, NOT
    // snapshotForBrowsingContext(null). BC-null + strictFirstDoc always
    // returned null → hooksArmed stuck false while Depth armed (Proof P0).
    // SubsequentNav idle is enforced only in workerPayloadForBrowsingContext.
    let persona = null;
    let depth = null;
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      persona = normalizePersona(
        DarkstrNativePersona.getPlan?.()?.snapshot || null
      );
    } catch (_e) {}
    try {
      const { DarkstrDepthHooks } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrDepthHooks.sys.mjs"
      );
      // Prefer Depth's global plan seeds (not BC-gated null).
      const plan = DarkstrDepthHooks.getPlan?.();
      const seeds = plan?.armed ? plan.seeds : null;
      if (seeds && typeof seeds.canvasSeed === "number") {
        const audioSeed = seeds.audioSeed >>> 0;
        const canvasSeed = seeds.canvasSeed >>> 0;
        // Soft residual (0043): prefer Depth plan webgpuSeed (0038 SoT).
        depth = {
          canvasSeed,
          audioSeed,
          webgpuSeed: readWebGpuSeed(seeds, canvasSeed, audioSeed),
          gpu: normalizeGpu(seeds.gpu) || {
            vendor: "Apple",
            renderer: "Apple M1",
          },
        };
      }
    } catch (_e) {}

    if (!persona) {
      persona = this._readPersonaFromPrefs();
    }
    if (!depth) {
      depth = this._readDepthFromPrefs();
    }
    if (!persona) {
      return null;
    }
    return { persona, depth };
  },

  _readPersonaFromPrefs() {
    try {
      const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
      if (raw) {
        const parsed = JSON.parse(raw);
        const persona = normalizePersona(parsed);
        if (persona) {
          return persona;
        }
      }
    } catch (_e) {}
    const seed = this._readPersonaSeedPref();
    if (!seed) {
      return null;
    }
    return this._generatePersonaFromSeed(seed >>> 0);
  },

  _readDepthFromPrefs() {
    try {
      const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
      if (raw) {
        const parsed = JSON.parse(raw);
        const canvasSeed = readU32Field(parsed, "canvasSeed", "canvas_seed");
        const audioSeed = readU32Field(parsed, "audioSeed", "audio_seed");
        const gpu = normalizeGpu(parsed.gpu);
        if (canvasSeed !== null && audioSeed !== null && gpu) {
          return {
            canvasSeed,
            audioSeed,
            webgpuSeed: readWebGpuSeed(parsed, canvasSeed, audioSeed),
            gpu,
          };
        }
      }
    } catch (_e) {}
    const seed = this._readPersonaSeedPref();
    if (!seed) {
      return null;
    }
    return this._generateDepthFromSeed(seed >>> 0);
  },

  /**
   * Read darkstr.persona.seed regardless of stored type.
   * 2-arg getIntPref(name, 0) returns 0 without throw on a string pref,
   * so type-detect first.
   */
  _readPersonaSeedPref() {
    let type;
    try {
      type = Services.prefs.getPrefType(SEED_PREF);
    } catch (_e) {
      return 0;
    }
    if (type === Ci.nsIPrefBranch.PREF_INT) {
      try {
        return Services.prefs.getIntPref(SEED_PREF);
      } catch (e) {
        console.error("darkstr worker int seed read failed", e);
        return 0;
      }
    }
    if (type === Ci.nsIPrefBranch.PREF_STRING) {
      try {
        const raw = Services.prefs.getStringPref(SEED_PREF);
        const n = Number(String(raw).trim());
        if (Number.isFinite(n) && n !== 0) {
          return n | 0;
        }
      } catch (e) {
        console.error("darkstr worker string seed read failed", e);
      }
    }
    return 0;
  },

  _generatePersonaFromSeed(seed) {
    const rng = mulberry32(seed);
    const os = detectHostOs();
    const group = UA_GROUPS[os] || UA_GROUPS.windows;
    void pickFrom([0, 1], rng);
    const userAgent = pickFrom(group.uas, rng);
    const platform = group.platform;
    const hardwareConcurrency = pickFrom(CORES, rng);
    const deviceMemory = pickFrom(MEMORY, rng);
    void pickFrom([0, 1], rng); // screen
    void pickFrom([24, 30], rng); // colorDepth
    void pickFrom(GPU_BY_OS[os] || GPU_BY_OS.windows, rng);
    const languages = pickFrom(LANGUAGES, rng);
    void pickFrom([0, 1], rng); // timezone
    return {
      userAgent,
      platform,
      hardwareConcurrency,
      deviceMemory,
      languages,
    };
  },

  _generateDepthFromSeed(seed) {
    const rng = mulberry32(seed);
    void pickFrom([0, 1], rng);
    void pickFrom([0, 1], rng);
    const os = detectHostOs();
    const gpus = GPU_BY_OS[os] || GPU_BY_OS.windows;
    const gpu = pickFrom(gpus, rng);
    void pickFrom(CORES, rng);
    void pickFrom(MEMORY, rng);
    void pickFrom([0, 1], rng);
    void pickFrom([24, 30], rng);
    const gpu2 = pickFrom(gpus, rng);
    void pickFrom([0, 1], rng);
    void pickFrom([0, 1], rng);
    const canvasSeed = (rng() * 0xffffffff) >>> 0;
    const audioSeed = (rng() * 0xffffffff) >>> 0;
    // Soft residual (0043): webgpuSeed after canvas/audio (Depth 0038 parity).
    const webgpuSeed = (rng() * 0xffffffff) >>> 0;
    return {
      canvasSeed,
      audioSeed,
      webgpuSeed,
      gpu: gpu2 || gpu,
    };
  },

  _setArmed(armed, payload) {
    this._armed = !!armed;
    try {
      Services.prefs.setBoolPref(ARMED_PREF, this._armed);
    } catch (_e) {}
    try {
      if (this._armed && payload?.persona) {
        Services.prefs.setStringPref(
          LAST_PAYLOAD_PREF,
          JSON.stringify({
            ua: payload.persona.userAgent,
            platform: payload.persona.platform,
            hw: payload.persona.hardwareConcurrency,
            mem: payload.persona.deviceMemory,
            langs: payload.persona.languages,
            canvasSeed: payload.depth?.canvasSeed ?? null,
            webgpuSeed: payload.depth?.webgpuSeed ?? null,
            gpu: payload.depth?.gpu ?? null,
          })
        );
      } else {
        Services.prefs.setStringPref(LAST_PAYLOAD_PREF, "");
      }
    } catch (_e) {}
  },
};
