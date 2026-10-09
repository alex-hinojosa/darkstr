/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr Phase 3 pin 2 — thin native Canvas 2D / WebGL / Audio depth hooks (chrome).
 *
 * Train pin: Firefox / LibreWolf 155.0.1-1 (FIREFOX_155_0_1_RELEASE).
 * Brand: darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.
 *
 * Mirrors public control plane (no Rust FFI required in this drop):
 *   duppel_bridge::read_depth_seeds / DepthSurface / HookApplicatorSurface::{Canvas2dNoise,WebGlRendererStrings,AudioFingerprint}
 *   duppel_persona::PersonaSnapshot::depth_canvas_seed / depth_audio_seed / depth_webgl_gpu
 *
 * Gates (default-off — idle unless explicitly allowed):
 *   pollution_active = mode=="pollution" && !nativeCompatible
 *   allow = pollution_active && darkstr.nativePersonaHooks
 *   per-BC delivery also requires DocShell SubsequentNav arm when strictFirstDoc
 *   (0020 — prefers NativePersona.snapshotForBrowsingContext / phase mirror)
 * Homogeneous / Native-Compatible / hooks false → no content hooks; seeds null.
 *
 * Seeds: prefer darkstr.persona.snapshot JSON (canvasSeed/audioSeed/gpu);
 * fallback derive from darkstr.persona.seed (mulberry32). Under 0030 rotatePerSite,
 * depthSeedsForBrowsingContext re-derives from eTLD-effective seed (_seedForEtld);
 * golden lock (snapshot / rotatePerSite=false) keeps global plan.seeds.
 * Soft residual (0034): darkstr.depth.lastSeeds mirrors the seeds actually handed
 * to content install (eTLD-derived when rotatePerSite; global/plan under golden lock)
 * so diag matches digests. Does not write privacy.*.
 * Soft residual (0036): depth fontSeed (derived after canvasSeed/audioSeed so golden
 * digests stay intact) drives fonts coherence farbling in DepthHooksChild —
 * measureText / document.fonts.check / DOM width probes. Folded into lastSeeds.
 * Soft residual (0037): depth speechSeed (derived AFTER fontSeed so prior digests
 * stay intact) drives speechSynthesis.getVoices coherence in DepthHooksChild.
 * Snapshot may supply speechSeed/speech_seed; else stable XOR fallback. Folded
 * into lastSeeds. SpeechRecognition soft/out-of-scope when pref-off.
 * Soft residual (0038): depth webgpuSeed (derived AFTER speechSeed so prior digests
 * stay intact) drives WebGPU adapter/device/limits/features coherence in
 * DepthHooksChild when navigator.gpu is exposed. LibreWolf defaults
 * dom.webgpu.enabled=false — hooks idle when API absent (no inventing WebGPU).
 * Snapshot may supply webgpuSeed/webgpu_seed; else stable XOR fallback. Folded
 * into lastSeeds. AdapterInfo stays Firefox/LibreWolf/Gecko-plausible and
 * coherent with depth gpu persona (no Chrome adapter cosplay).
 *
 * Workers = Phase 3 pin 3 — NOT in this module.
 *
 * 0057 (Fable B2): depth farbling is seeded per site from the persisted 0056
 * seed store. It arms when Pollution, hooks and per-site rotation on the store
 * are all on (no snapshot / darkstr.persona.seed needed); each (container,
 * site) gets its own canvas / audio / WebGL / fonts / WebGPU noise, stable
 * across reloads and restarts and different across sites and users.
 * darkstr.persona.seed / a snapshot remain the deterministic Proof path only.
 * Content pulls seeds synchronously at DOMWindowCreated (sharedData armed
 * hint), so page scripts never read a native value first. Off mode: idle.
 */

const MODE_PREF = "darkstr.mode";
const NATIVE_PREF = "darkstr.nativeCompatible";
const HOOKS_PREF = "darkstr.nativePersonaHooks";
const SNAPSHOT_PREF = "darkstr.persona.snapshot";
const SEED_PREF = "darkstr.persona.seed";
const ARMED_PREF = "darkstr.depth.hooksArmed";
const LAST_SEEDS_PREF = "darkstr.depth.lastSeeds";
const LAST_ERROR_PREF = "darkstr.depth.lastError";
const LAST_INSTALL_PREF = "darkstr.depth.lastInstall";
/** 0057: rotation pref (NativePersona) — depth arms on per-site store seeds. */
const ROTATE_PER_SITE_PREF = "darkstr.persona.rotatePerSite";
/** 0057: content asks for seeds synchronously at DOMWindowCreated. */
const MSG_SEEDS_SYNC = "DarkstrDepthHooks:GetSeedsSync";
/** 0057: sharedData hint so idle profiles never make the sync call. */
const SHARED_ARMED_KEY = "darkstr:depthArmed";

/**
 * 0052 (Fable B1 / O7): diagnostics stay in memory. They reach prefs.js only
 * while darkstr.debug.diagPrefs is true (default false; QA / Proof harnesses
 * set it in user.js). Chrome callers read the same values through
 * getDiagnostics(). Stale values are swept at startup by DarkstrModeXor.
 */
const DIAG_PREFS_PREF = "darkstr.debug.diagPrefs";
const gDiag = new Map();
const diagPrefs = {
  _write(setter, name, value) {
    gDiag.set(name, value);
    let on = false;
    try {
      on = Services.prefs.getBoolPref(DIAG_PREFS_PREF, false);
    } catch (_e) {
      on = false;
    }
    if (on === true) {
      Services.prefs[setter](name, value);
    }
  },
  setBoolPref(name, value) {
    this._write("setBoolPref", name, value);
  },
  setIntPref(name, value) {
    this._write("setIntPref", name, value);
  },
  setStringPref(name, value) {
    this._write("setStringPref", name, value);
  },
  snapshot() {
    return Object.fromEntries(gDiag);
  },
};

// Host-OS filtered Firefox-family GPU pairs (thin subset of profiles.js).
// 0057r4: renderers are the RAW GL_RENDERER Firefox gets on that OS (Windows:
// ANGLE Direct3D11); page / worker hooks report them through Gecko's
// sanitizer like stock ("..., or similar").
const GPU_BY_OS = {
  macos: [
    { vendor: "Apple", renderer: "Apple M1" },
    { vendor: "Apple", renderer: "Apple M2" },
    { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Plus Graphics" },
  ],
  windows: [
    { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  ],
  linux: [
    { vendor: "Intel", renderer: "Mesa Intel(R) UHD Graphics 630 (CFL GT2)" },
    { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2" },
    { vendor: "AMD", renderer: "AMD Radeon RX 580 (radeonsi, polaris10, LLVM 15.0.7, DRM 3.54, 6.8.0)" },
  ],
};

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


function deriveFontSeed(canvasSeed, audioSeed) {
  // Stable fallback when snapshot omits fontSeed — does not consume mulberry stream.
  return (canvasSeed ^ Math.imul(audioSeed >>> 0, 0x9e3779b9)) >>> 0;
}

function readFontSeed(obj, canvasSeed, audioSeed) {
  const direct = readU32Field(obj, "fontSeed", "font_seed");
  if (direct !== null) {
    return direct >>> 0;
  }
  return deriveFontSeed(canvasSeed >>> 0, audioSeed >>> 0);
}

function deriveSpeechSeed(fontSeed, canvasSeed) {
  // Stable fallback when snapshot omits speechSeed — does not consume mulberry stream.
  return (fontSeed ^ Math.imul(canvasSeed >>> 0, 0x85ebca6b)) >>> 0;
}

function readSpeechSeed(obj, fontSeed, canvasSeed) {
  const direct = readU32Field(obj, "speechSeed", "speech_seed");
  if (direct !== null) {
    return direct >>> 0;
  }
  return deriveSpeechSeed(fontSeed >>> 0, canvasSeed >>> 0);
}

function deriveWebGpuSeed(speechSeed, audioSeed) {
  // Stable fallback when snapshot omits webgpuSeed — does not consume mulberry stream.
  return (speechSeed ^ Math.imul(audioSeed >>> 0, 0xc2b2ae35)) >>> 0;
}

function readWebGpuSeed(obj, speechSeed, audioSeed) {
  const direct = readU32Field(obj, "webgpuSeed", "webgpu_seed");
  if (direct !== null) {
    return direct >>> 0;
  }
  return deriveWebGpuSeed(speechSeed >>> 0, audioSeed >>> 0);
}

export var DarkstrDepthHooks = {
  /** 0052: in-memory diagnostics (what used to be darkstr.*.last* prefs). */
  getDiagnostics() {
    return diagPrefs.snapshot();
  },

  _inited: false,
  _actorRegistered: false,
  _observer: null,
  _seeds: null,
  _armed: false,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._observer = this._observe.bind(this);
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF, SNAPSHOT_PREF, SEED_PREF, ROTATE_PER_SITE_PREF]) {
      Services.prefs.addObserver(p, this._observer);
    }
    // 0057: synchronous seed pull (DOMWindowCreated) so page scripts never see
    // a native readout before the hooks are in (same pattern as the 0051
    // NativePersona install).
    this._syncListener = {
      receiveMessage: message => {
        try {
          return this._onSyncSeeds(message);
        } catch (e) {
          console.error("darkstr 0057: depth seed sync IPC failed", e);
          return { retry: true };
        }
      },
    };
    try {
      Services.ppmm.addMessageListener(MSG_SEEDS_SYNC, this._syncListener);
    } catch (_e) {}
    this._registerActor();
    this.refreshPlan();
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    for (const p of [MODE_PREF, NATIVE_PREF, HOOKS_PREF, SNAPSHOT_PREF, SEED_PREF, ROTATE_PER_SITE_PREF]) {
      try {
        Services.prefs.removeObserver(p, this._observer);
      } catch (_e) {}
    }
    try {
      Services.ppmm.removeMessageListener(MSG_SEEDS_SYNC, this._syncListener);
    } catch (_e) {}
    this._syncListener = null;
    if (this._actorRegistered) {
      try {
        ChromeUtils.unregisterWindowActor("DarkstrDepthHooks");
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
      ChromeUtils.registerWindowActor("DarkstrDepthHooks", {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrDepthHooksParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/DarkstrDepthHooksChild.sys.mjs",
          events: {
            DOMWindowCreated: {},
            // 0057: same-origin iframes reuse the initial about:blank window
            // (no DOMWindowCreated for their document): install before any
            // of their scripts run.
            DOMDocElementInserted: {},
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
      console.error("darkstr P3: DepthHooks JSWindowActor register failed:", e);
      this.recordInstallStatus({
        ok: false,
        event: "register",
        status: "register-failed",
        error: String(e?.stack || e?.message || e || "register failed"),
      });
    }
  },

  /**
   * Resolve depth gate + seeds (read_depth_seeds equivalent).
   * @returns {{
   *   pollutionActive: boolean,
   *   nativeHooks: boolean,
   *   armed: boolean,
   *   seeds: {canvasSeed:number, audioSeed:number, fontSeed:number, speechSeed:number, webgpuSeed:number, gpu:{vendor:string,renderer:string}}|null
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
    const seeds = pollutionActive ? this._readDepthSeeds() : null;
    // 0057 (Fable B2): without a snapshot / Proof test seed, depth arms on the
    // persisted per-site seeds (0056 store) — every site, every user its own
    // noise. darkstr.persona.seed is the deterministic Proof path only. Off
    // mode never gets here (pollutionActive false: NativePersona untouched).
    const perSite = !!(
      pollutionActive &&
      nativeHooks &&
      !seeds &&
      this._perSiteStoreActive()
    );
    const armed = !!(pollutionActive && nativeHooks && (seeds || perSite));

    this._plan = {
      pollutionActive,
      nativeHooks,
      armed,
      perSite,
      seeds: armed && seeds ? seeds : null,
    };
    this._seeds = this._plan.seeds;
    this._setArmed(armed, this._seeds);
    return this._plan;
  },

  getPlan() {
    return this._plan || this.refreshPlan();
  },

  _nativePersona() {
    return ChromeUtils.importESModule(
      "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
    ).DarkstrNativePersona;
  },

  /** 0057: NativePersona per-site rotation runs on the 0056 store. */
  _perSiteStoreActive() {
    try {
      const NP = this._nativePersona();
      return !!NP._storeRotationActive?.(NP.getPlan());
    } catch (_e) {
      return false;
    }
  },

  /** 0057: sync seed pull from DarkstrDepthHooksChild (DOMWindowCreated). */
  _onSyncSeeds(message) {
    const id = message?.data?.innerWindowId;
    let wgp = null;
    try {
      wgp = id ? WindowGlobalParent.getByInnerWindowId(id) : null;
    } catch (_e) {}
    if (!wgp) {
      return { retry: true };
    }
    try {
      const senderPid = message.target?.osPid;
      if (
        typeof senderPid === "number" &&
        typeof wgp.osPid === "number" &&
        senderPid > 0 &&
        wgp.osPid > 0 &&
        senderPid !== wgp.osPid
      ) {
        return { seeds: null, error: "pid-mismatch" };
      }
    } catch (_e) {}
    return { seeds: this.depthSeedsForBrowsingContext(wgp.browsingContext, wgp) };
  },

  /** Persist content-install diagnostics. Never writes privacy.*. */
  recordInstallStatus(detail, browsingContext = null) {
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
    try {
      diagPrefs.setStringPref(LAST_INSTALL_PREF, JSON.stringify(payload));
    } catch (e) {
      console.error("darkstr depth lastInstall write failed", e);
    }
    try {
      if (payload.ok) {
        diagPrefs.setStringPref(LAST_ERROR_PREF, "");
      } else {
        diagPrefs.setStringPref(
          LAST_ERROR_PREF,
          `${payload.event}:${payload.status}:${payload.error}`.slice(0, 1000)
        );
      }
    } catch (e) {
      console.error("darkstr depth lastError write failed", e);
    }
  },

  /**
   * Depth seeds for JSWindowActor child (null when idle / first-doc).
   * 0057: `wgp` = the requesting document's WindowGlobalParent. At
   * DOMWindowCreated (sync pull) bc.currentWindowGlobal / currentURI can
   * still be the previous document (other site, or the initial about:blank),
   * so the site, container and snapshot come from that document's own
   * NativePersona decision (frames: their top document's decision).
   */
  depthSeedsForBrowsingContext(bc, wgp = null) {
    const plan = this.getPlan();
    if (!plan.armed || (!plan.seeds && !plan.perSite)) {
      return null;
    }
    // SubsequentNav arm: reuse NativePersona first-doc gate when available.
    // When 0030 rotatePerSite is active, ALWAYS derive depth seeds (incl.
    // webgpuSeed) from eTLD-effective persona seed — same SoT as sticky
    // rotation. Do NOT prefer snap canvas/audio first under rotate: FFI/persona
    // snaps may omit them and a fallthrough to global plan.seeds (seed-42)
    // collapses webgpuSeed across eTLD (Proof gate 3 FAIL).
    // Golden lock (snapshot pref non-empty OR rotatePerSite=false) keeps global
    // plan.seeds / snap depth fields from _readDepthSeeds (Proof seed-42).
    // Soft residual (0034): persist returned seeds to darkstr.depth.lastSeeds.
    try {
      const { DarkstrNativePersona } = ChromeUtils.importESModule(
        "moz-src:///browser/components/DarkstrNativePersona.sys.mjs"
      );
      let decision = null;
      if (wgp && DarkstrNativePersona.documentDecision) {
        try {
          decision = DarkstrNativePersona.documentDecision(wgp);
        } catch (_eDec) {
          decision = null;
        }
      }
      if (decision || DarkstrNativePersona.snapshotForBrowsingContext) {
        const snap = decision
          ? decision.snapshot
          : DarkstrNativePersona.snapshotForBrowsingContext(bc);
        if (!snap) {
          return null;
        }

        let rotating = false;
        try {
          const npPlan = DarkstrNativePersona.getPlan
            ? DarkstrNativePersona.getPlan()
            : null;
          rotating = !!(
            DarkstrNativePersona._rotationActive &&
            DarkstrNativePersona._rotationActive(npPlan)
          );
        } catch (_rotErr) {
          rotating = false;
        }

        // Soft residual (0038 Proof FAIL fix): rotate path FIRST.
        if (rotating) {
          let etld = null;
          try {
            if (decision) {
              etld = decision.site || null;
            } else if (DarkstrNativePersona._etldPlus1FromBrowsingContext) {
              etld = DarkstrNativePersona._etldPlus1FromBrowsingContext(bc);
            }
          } catch (_eEtld) {}
          // 0052 (Fable O13 / DH fallback): no fallback to the last visited
          // site. darkstr.persona.lastEtld / effectiveSeed were global
          // "last writer wins" prefs, so a frame whose own site could not be
          // resolved took another site's depth seeds. Now it gets none.
          let seed = 0;
          const ctx = decision?.ctx
            ? decision.ctx
            : DarkstrNativePersona._ctxOfBC
              ? DarkstrNativePersona._ctxOfBC(bc)
              : "0";
          if (etld && plan.perSite) {
            // 0057: the stored per-site seed only (no session-mix fallback).
            try {
              seed = DarkstrNativePersona._storeSeedForEtld(etld, ctx) >>> 0;
            } catch (_eSeed) {
              seed = 0;
            }
          } else if (etld && DarkstrNativePersona._seedForEtld) {
            try {
              seed = DarkstrNativePersona._seedForEtld(etld, ctx) >>> 0;
            } catch (_eSeed) {
              seed = 0;
            }
          }
          if (!seed) {
            return null;
          }
          if (seed) {
            const derived = this._generateDepthFromSeed(seed);
            if (derived) {
              const out = {
                canvasSeed: derived.canvasSeed >>> 0,
                audioSeed: derived.audioSeed >>> 0,
                fontSeed: derived.fontSeed >>> 0,
                speechSeed: derived.speechSeed >>> 0,
                webgpuSeed: derived.webgpuSeed >>> 0,
                gpu: {
                  vendor: derived.gpu.vendor,
                  renderer: derived.gpu.renderer,
                },
              };
              this._writeLastSeeds(out);
              return out;
            }
          }
        }

        // Non-rotate / golden: prefer depth fields already on resolved snapshot.
        const snapCanvas = readU32Field(snap, "canvasSeed", "canvas_seed");
        const snapAudio = readU32Field(snap, "audioSeed", "audio_seed");
        const snapGpu = normalizeGpu(snap.gpu);
        if (snapCanvas !== null && snapAudio !== null && snapGpu) {
          const snapFont = readFontSeed(snap, snapCanvas, snapAudio);
          const snapSpeech = readSpeechSeed(snap, snapFont, snapCanvas);
          const out = {
            canvasSeed: snapCanvas >>> 0,
            audioSeed: snapAudio >>> 0,
            fontSeed: snapFont,
            speechSeed: snapSpeech,
            webgpuSeed: readWebGpuSeed(snap, snapSpeech, snapAudio),
            gpu: { vendor: snapGpu.vendor, renderer: snapGpu.renderer },
          };
          this._writeLastSeeds(out);
          return out;
        }
      }
    } catch (_e) {
      // 0052: NativePersona unavailable → no per-tab phase or site decision.
      // The global darkstr.persona.docShellPhase mirror is diagnostics only
      // now (and was another tab's last load anyway), so fail closed.
      return null;
    }
    if (!plan.seeds) {
      // 0057: per-site arming has no global fallback (fail closed).
      return null;
    }
    const fontSeedOut =
      (plan.seeds.fontSeed >>> 0) ||
      deriveFontSeed(plan.seeds.canvasSeed, plan.seeds.audioSeed);
    const speechSeedOut =
      (plan.seeds.speechSeed >>> 0) ||
      deriveSpeechSeed(fontSeedOut, plan.seeds.canvasSeed);
    const out = {
      canvasSeed: plan.seeds.canvasSeed >>> 0,
      audioSeed: plan.seeds.audioSeed >>> 0,
      fontSeed: fontSeedOut,
      speechSeed: speechSeedOut,
      webgpuSeed:
        (plan.seeds.webgpuSeed >>> 0) ||
        deriveWebGpuSeed(speechSeedOut, plan.seeds.audioSeed),
      gpu: {
        vendor: plan.seeds.gpu.vendor,
        renderer: plan.seeds.gpu.renderer,
      },
    };
    this._writeLastSeeds(out);
    return out;
  },

  _readDepthSeeds() {
    // Prefer cached persona snapshot (same JSON bridge as NativePersona).
    try {
      const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const canvasSeed = readU32Field(parsed, "canvasSeed", "canvas_seed");
          const audioSeed = readU32Field(parsed, "audioSeed", "audio_seed");
          const gpu = normalizeGpu(parsed.gpu);
          if (canvasSeed !== null && audioSeed !== null && gpu) {
            {
              const fontSeed = readFontSeed(parsed, canvasSeed, audioSeed);
              const speechSeed = readSpeechSeed(parsed, fontSeed, canvasSeed);
              return {
                canvasSeed,
                audioSeed,
                fontSeed,
                speechSeed,
                webgpuSeed: readWebGpuSeed(parsed, speechSeed, audioSeed),
                gpu,
              };
            }
          }
          // Partial snapshot: fill missing fields from seed fallback below,
          // but keep present fields when we have a persona seed.
        }
      }
    } catch (_e) {}

    const seed = this._readPersonaSeedPref();
    if (!seed) {
      // Try partial snapshot fill without persona.seed.
      try {
        const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
        if (raw) {
          const parsed = JSON.parse(raw);
          const canvasSeed = readU32Field(parsed, "canvasSeed", "canvas_seed");
          const audioSeed = readU32Field(parsed, "audioSeed", "audio_seed");
          const gpu = normalizeGpu(parsed.gpu);
          // Need canvas+audio+gpu for a coherent depth payload; fontSeed fills.
          if (canvasSeed !== null && audioSeed !== null && gpu) {
            {
              const fontSeed = readFontSeed(parsed, canvasSeed, audioSeed);
              const speechSeed = readSpeechSeed(parsed, fontSeed, canvasSeed);
              return {
                canvasSeed,
                audioSeed,
                fontSeed,
                speechSeed,
                webgpuSeed: readWebGpuSeed(parsed, speechSeed, audioSeed),
                gpu,
              };
            }
          }
        }
      } catch (_e) {}
      return null;
    }
    return this._generateDepthFromSeed(seed >>> 0);
  },

  /**
   * Read darkstr.persona.seed regardless of stored type.
   * 2-arg getIntPref(name, 0) returns 0 without throw on a string pref,
   * so type-detect first. Int uses 1-arg getIntPref; string "42" parses.
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
        console.error("darkstr depth int seed read failed", e);
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
        console.error("darkstr depth string seed read failed", e);
      }
    }
    return 0;
  },

  _generateDepthFromSeed(seed) {
    const rng = mulberry32(seed);
    // Advance RNG in the same rough order as profiles.js generateProfile
    // (UA/platform/HW/screen/color skipped via discarded picks) so canvas/audio
    // remain correlated with a full persona when only seed is present.
    void pickFrom([0, 1], rng); // UA group stand-in
    void pickFrom([0, 1], rng); // UA stand-in
    const os = detectHostOs();
    const gpus = GPU_BY_OS[os] || GPU_BY_OS.windows;
    const gpu = pickFrom(gpus, rng);
    void pickFrom([4, 8, 10, 12, 16], rng);
    void pickFrom([4, 8, 16, 32], rng);
    void pickFrom([0, 1], rng); // screen
    void pickFrom([24, 30], rng); // colorDepth
    // gpu already picked above to match host OS; re-pick for seed stream parity
    // with profiles.js (gpu after screen/colorDepth):
    const gpu2 = pickFrom(gpus, rng);
    void pickFrom([0, 1], rng); // languages
    void pickFrom([0, 1], rng); // timezone
    const canvasSeed = (rng() * 0xffffffff) >>> 0;
    const audioSeed = (rng() * 0xffffffff) >>> 0;
    // Soft residual (0036): fontSeed AFTER canvas/audio so prior digests unchanged.
    const fontSeed = (rng() * 0xffffffff) >>> 0;
    // Soft residual (0037): speechSeed AFTER fontSeed so prior digests unchanged.
    const speechSeed = (rng() * 0xffffffff) >>> 0;
    // Soft residual (0038): webgpuSeed AFTER speechSeed so prior digests unchanged.
    const webgpuSeed = (rng() * 0xffffffff) >>> 0;
    return {
      canvasSeed,
      audioSeed,
      fontSeed,
      speechSeed,
      webgpuSeed,
      gpu: gpu2 || gpu,
    };
  },

  /**
   * Persist depth install-seed diagnostics (darkstr.depth.lastSeeds only).
   * Soft residual (0034): called from depthSeedsForBrowsingContext with the
   * same seeds handed to content, and from _setArmed for arm/disarm baseline.
   */
  /** 0056: a persona seed was cleared — drop the in-memory seed copies. */
  flushSeedCopies() {
    try {
      gDiag.delete(LAST_SEEDS_PREF);
    } catch (_e) {}
    try {
      if (Services.prefs.prefHasUserValue(LAST_SEEDS_PREF)) {
        Services.prefs.clearUserPref(LAST_SEEDS_PREF);
      }
    } catch (_e) {}
  },

  _writeLastSeeds(seeds) {
    try {
      if (seeds) {
        diagPrefs.setStringPref(
          LAST_SEEDS_PREF,
          JSON.stringify((() => {
            const fontSeed =
              seeds.fontSeed != null
                ? seeds.fontSeed >>> 0
                : deriveFontSeed(seeds.canvasSeed, seeds.audioSeed);
            const speechSeed =
              seeds.speechSeed != null
                ? seeds.speechSeed >>> 0
                : deriveSpeechSeed(fontSeed, seeds.canvasSeed);
            return {
              canvasSeed: seeds.canvasSeed >>> 0,
              audioSeed: seeds.audioSeed >>> 0,
              fontSeed,
              speechSeed,
              webgpuSeed:
                seeds.webgpuSeed != null
                  ? seeds.webgpuSeed >>> 0
                  : deriveWebGpuSeed(speechSeed, seeds.audioSeed),
              gpu: seeds.gpu,
            };
          })())
        );
      } else {
        diagPrefs.setStringPref(LAST_SEEDS_PREF, "");
      }
    } catch (_e) {}
  },

  _setArmed(armed, seeds) {
    this._armed = !!armed;
    try {
      diagPrefs.setBoolPref(ARMED_PREF, this._armed);
    } catch (_e) {}
    try {
      const shared = Services.ppmm.sharedData;
      if (shared.get(SHARED_ARMED_KEY) !== this._armed) {
        shared.set(SHARED_ARMED_KEY, this._armed);
        shared.flush();
      }
    } catch (_e) {}
    if (this._armed && seeds) {
      this._writeLastSeeds(seeds);
    } else {
      this._writeLastSeeds(null);
    }
  },
};
